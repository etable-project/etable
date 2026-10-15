-- Schéma 2 du serveur Établi : clés d'accès.
-- Une clé donne accès aux données d'un utilisateur à un programme (un assistant, un script) sans son mot de passe.
-- Elle ne donne jamais les droits d'administration ; l'utilisateur peut la révoquer à tout moment.
CREATE TABLE cles_acces (
    id                   TEXT PRIMARY KEY,
    utilisateur_id       TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    nom                  TEXT NOT NULL,
    empreinte            TEXT NOT NULL UNIQUE,              -- SHA-256 de la clé ; la clé n'est jamais stockée
    cree                 INTEGER NOT NULL,
    derniere_utilisation INTEGER
);
CREATE INDEX cles_acces_utilisateur ON cles_acces(utilisateur_id);
