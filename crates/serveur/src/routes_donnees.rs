//! Données de plugin (réglages, services publiés) et réglages de l'application, par utilisateur.

use crate::{
    auth::Session,
    base::maintenant_ms,
    erreur::{Erreur, Resultat},
    etat::Etat,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use etabli_noyau::identifiants::donnees_valide;
use rusqlite::OptionalExtension;
use serde::Deserialize;
use serde_json::{json, Value};

/// Taille maximale d'une donnée ou des réglages, une fois en JSON.
pub const TAILLE_MAX: usize = 1024 * 1024;
/// Nombre maximal de données nommées par utilisateur.
const NOMS_MAX: i64 = 500;

fn controler_taille(valeur: &Value) -> Resultat<String> {
    let texte = serde_json::to_string(valeur).map_err(|e| Erreur::Interne(e.to_string()))?;
    if texte.len() > TAILLE_MAX {
        return Err(Erreur::TropVolumineux);
    }
    Ok(texte)
}

/// Contenu enregistré, ou `null` s'il n'y a encore rien (comme le fait l'application de bureau).
/// L'en-tête `X-Version` donne la version lue (0 s'il n'y a rien) : un client qui veut éviter d'écraser un autre
/// appareil la renvoie en `?versionAttendue=` à l'écriture.
pub async fn lire(
    State(etat): State<Etat>,
    session: Session,
    Path(nom): Path<String>,
) -> Resultat<Response> {
    if !donnees_valide(&nom) {
        return Err(Erreur::requete("Nom de données invalide."));
    }
    let lu: Option<(String, i64)> = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT valeur, version FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                rusqlite::params![session.utilisateur_id, nom],
                |l| Ok((l.get(0)?, l.get(1)?)),
            )
            .optional()?)
        })
        .await?;
    let version = lu.as_ref().map_or(0, |(_, v)| *v);
    let valeur = lu
        .and_then(|(t, _)| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null);
    Ok(([("x-version", version.to_string())], Json(valeur)).into_response())
}

/// Condition facultative d'écriture : sans elle, l'écriture écrase (comportement historique).
#[derive(Deserialize)]
pub struct Condition {
    /// Version lue par le client (0 = « rien d'enregistré ») : si la donnée a changé depuis, l'écriture est refusée (409).
    #[serde(rename = "versionAttendue")]
    version_attendue: Option<u64>,
}

pub async fn ecrire(
    State(etat): State<Etat>,
    session: Session,
    Path(nom): Path<String>,
    Query(condition): Query<Condition>,
    Json(valeur): Json<Value>,
) -> Resultat<Json<Value>> {
    if !donnees_valide(&nom) {
        return Err(Erreur::requete("Nom de données invalide."));
    }
    let texte = controler_taille(&valeur)?;
    let (prevenu, nom_diffuse) = (session.utilisateur_id.clone(), nom.clone());
    let version = etat
        .base
        .executer(move |c| {
            let tx = c.transaction()?;
            let actuelle: Option<i64> = tx
                .query_row(
                    "SELECT version FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                    rusqlite::params![session.utilisateur_id, nom],
                    |l| l.get(0),
                )
                .optional()?;
            if let Some(attendue) = condition.version_attendue {
                let version_actuelle = actuelle.unwrap_or(0) as u64;
                if attendue != version_actuelle {
                    return Err(Erreur::Conflit { version_actuelle });
                }
            }
            if actuelle.is_none() {
                let total: i64 = tx.query_row("SELECT count(*) FROM donnees WHERE utilisateur_id = ?1", [&session.utilisateur_id], |l| l.get(0))?;
                if total >= NOMS_MAX {
                    return Err(Erreur::requete("Trop de données enregistrées."));
                }
            }
            tx.execute(
                "INSERT INTO donnees(utilisateur_id, nom, valeur, version, modifie) VALUES (?1, ?2, ?3, 1, ?4) \
                 ON CONFLICT(utilisateur_id, nom) DO UPDATE SET valeur = ?3, version = version + 1, modifie = ?4",
                rusqlite::params![session.utilisateur_id, nom, texte, maintenant_ms() as i64],
            )?;
            let version: i64 = tx.query_row(
                "SELECT version FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                rusqlite::params![session.utilisateur_id, nom],
                |l| l.get(0),
            )?;
            tx.commit()?;
            Ok(version)
        })
        .await?;
    // Les autres appareils de l'utilisateur relisent cette donnée tout de suite (personne n'écoute : l'envoi est ignoré).
    let _ = etat.evenements.send(crate::etat::Evenement {
        utilisateur_id: prevenu,
        genre: "donnees",
        nom: nom_diffuse,
    });
    Ok(Json(json!({ "version": version })))
}

/// Réglages de l'application (clés `settings` et `session` de l'interface) : un objet JSON.
pub async fn lire_reglages(State(etat): State<Etat>, session: Session) -> Resultat<Json<Value>> {
    let texte: Option<String> = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT valeur FROM reglages WHERE utilisateur_id = ?1",
                [&session.utilisateur_id],
                |l| l.get(0),
            )
            .optional()?)
        })
        .await?;
    Ok(Json(
        texte
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_else(|| json!({})),
    ))
}

pub async fn ecrire_reglages(
    State(etat): State<Etat>,
    session: Session,
    Json(valeur): Json<Value>,
) -> Resultat<StatusCode> {
    if !valeur.is_object() {
        return Err(Erreur::requete("Les réglages doivent être un objet JSON."));
    }
    let texte = controler_taille(&valeur)?;
    etat.base
        .executer(move |c| {
            c.execute(
                "INSERT INTO reglages(utilisateur_id, valeur, modifie) VALUES (?1, ?2, ?3) \
                 ON CONFLICT(utilisateur_id) DO UPDATE SET valeur = ?2, modifie = ?3",
                rusqlite::params![session.utilisateur_id, texte, maintenant_ms() as i64],
            )?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
