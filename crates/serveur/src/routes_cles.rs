//! Clés d'accès : l'utilisateur enregistre une clé (fabriquée par le programme qui s'en servira, par exemple
//! l'assistant personnel) et le serveur l'accepte ensuite comme un jeton de cet utilisateur, sans droits d'administration.
//! Seule une vraie session (mot de passe) gère les clés : une clé ne peut pas en ajouter ni en retirer.

use crate::{
    auth::Session,
    base::{journaliser, maintenant_ms},
    erreur::{Erreur, Resultat},
    etat::Etat,
    securite::empreinte,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

/// Au plus ce nombre de clés par utilisateur.
const CLES_MAX: i64 = 10;

#[derive(Deserialize)]
pub struct Nouvelle {
    nom: String,
    cle: String,
}

fn cle_valide(cle: &str) -> bool {
    cle.len() >= 32
        && cle.len() <= 128
        && cle
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub async fn lister(State(etat): State<Etat>, session: Session) -> Resultat<Json<Value>> {
    if session.par_cle {
        return Err(Erreur::Interdit);
    }
    let lignes = etat
        .base
        .executer(move |c| {
            let mut r = c.prepare("SELECT id, nom, cree, derniere_utilisation FROM cles_acces WHERE utilisateur_id = ?1 ORDER BY cree")?;
            let v = r
                .query_map([&session.utilisateur_id], |l| {
                    Ok(json!({"id": l.get::<_, String>(0)?, "nom": l.get::<_, String>(1)?, "cree": l.get::<_, i64>(2)?, "derniereUtilisation": l.get::<_, Option<i64>>(3)?}))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(v)
        })
        .await?;
    Ok(Json(Value::Array(lignes)))
}

pub async fn ajouter(
    State(etat): State<Etat>,
    session: Session,
    Json(n): Json<Nouvelle>,
) -> Resultat<(StatusCode, Json<Value>)> {
    if session.par_cle {
        return Err(Erreur::Interdit);
    }
    let nom = n.nom.trim().to_string();
    if nom.is_empty() || nom.chars().count() > 60 {
        return Err(Erreur::requete(
            "Le nom de la clé doit faire 1 à 60 caractères.",
        ));
    }
    let cle = n.cle.trim().to_string();
    if !cle_valide(&cle) {
        return Err(Erreur::requete(
            "Clé invalide : 32 à 128 caractères (lettres, chiffres, tiret, tiret bas).",
        ));
    }
    let (id, empreinte_cle) = (uuid::Uuid::new_v4().simple().to_string(), empreinte(&cle));
    let (id2, nom2) = (id.clone(), nom.clone());
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            let total: i64 = tx.query_row("SELECT count(*) FROM cles_acces WHERE utilisateur_id = ?1", [&session.utilisateur_id], |l| l.get(0))?;
            if total >= CLES_MAX {
                return Err(Erreur::requete("Trop de clés : retirez-en une avant d'en ajouter."));
            }
            let existe: i64 = tx.query_row("SELECT count(*) FROM cles_acces WHERE empreinte = ?1", [&empreinte_cle], |l| l.get(0))?;
            if existe > 0 {
                return Err(Erreur::requete("Cette clé est déjà enregistrée."));
            }
            tx.execute(
                "INSERT INTO cles_acces(id, utilisateur_id, nom, empreinte, cree) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![id2, session.utilisateur_id, nom2, empreinte_cle, maintenant_ms() as i64],
            )?;
            journaliser(&tx, Some(&session.utilisateur_id), "cle_ajoutee", Some(&nom2), None)?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": id, "nom": nom }))))
}

pub async fn supprimer(
    State(etat): State<Etat>,
    session: Session,
    Path(id): Path<String>,
) -> Resultat<StatusCode> {
    if session.par_cle {
        return Err(Erreur::Interdit);
    }
    etat.base
        .executer(move |c| {
            let nom: Option<String> = c
                .query_row(
                    "SELECT nom FROM cles_acces WHERE id = ?1 AND utilisateur_id = ?2",
                    rusqlite::params![id, session.utilisateur_id],
                    |l| l.get(0),
                )
                .ok();
            let Some(nom) = nom else {
                return Err(Erreur::Introuvable);
            };
            c.execute("DELETE FROM cles_acces WHERE id = ?1", [&id])?;
            journaliser(
                c,
                Some(&session.utilisateur_id),
                "cle_retiree",
                Some(&nom),
                None,
            )?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
