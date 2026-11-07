# ORBITE

Tâches, agenda, projets et organisation de la vie courante. Remplace l'espace Notion « ORBITE ».

- Interface : HTML/JS statique (aucune compilation), installable sur téléphone (PWA).
- Données : Supabase, projet `orbite` (ca-central-1), protégées par RLS. Seul le compte propriétaire peut lire ou écrire.
- Hébergement : GitHub Pages (branche `main`, dossier racine).

## Modules

| Groupe | Module | Rôle |
| --- | --- | --- |
| Pilotage | Accueil | Compteurs, en cours, backlog, transports du jour, à surveiller, 7 prochains jours, projets |
| | Agenda | Événements, tâches planifiées et échéances, jour par jour |
| | Projets | Avancement, santé, budget par lots (HT, TTC, réserve, engagé, payé), actions, parties prenantes, achats et notes liés |
| | Actions | Recherche et filtres sur tout |
| | Délégations | Ce que j'ai délégué ou attends, par personne, avec relance et courriel de suivi |
| | Revue hebdo | Captures, retards, projets sans suite, charge, abonnements, checklist |
| Vie | Transports | Trajets de la semaine, responsable et statut, génération de la semaine type |
| | Véhicules | Programme d'entretien saisonnier, interventions, pneus montés, dépenses |
| | Achats | Liste par magasin, commandes à recevoir, historique |
| | Abonnements | Budget mensuel et annuel, facturations et fins d'essai à venir |
| | Bibliothèque | En lecture, prochain livre, avis, terminés |
| | Routines | Habitudes, cible et réalisations sur 7 jours |
| Repères | Carnet | Notes, idées, comptes rendus, décisions, bilans |
| | Organigramme | Postes et hiérarchie, unités, titulaires |
| | Personnes et domaines | Répertoire et domaines de vie |
| | Réglages | Notifications, calendriers Outlook, sauvegardes, Jira, hors ligne |

L'accueil commence par **Aujourd'hui, je fais** : au plus trois actions choisies pour la journée.

Capture rapide : bouton orange, ou touche **N** sur ordinateur (tâche, événement, jalon, rappel, achat, note).

Données importées de Notion le 6 novembre 2026 (colonne `notion_id` pour la traçabilité).

## Automatisations (Supabase)

| Tâche programmée | Quand (heure de Toronto) | Fonction |
| --- | --- | --- |
| Semaine type des transports | Dimanche soir | `prive.generer_semaine_type()` |
| Notifications (matin, soir, rendez-vous) | Chaque heure à :15 | Edge Function `rappels` |
| Import du calendrier Outlook publié | Chaque heure à :45 | Edge Function `outlook` |
| Statut Jira | Chaque heure, jours de semaine | Edge Function `jira` (inactive sans `JIRA_COURRIEL` et `JIRA_JETON`) |
| Sauvegarde complète (12 conservées) | Dimanche matin | Edge Function `sauvegarde` → stockage privé `sauvegardes` |

Flux iCalendar pour Outlook : Edge Function `calendrier?jeton=…` (lien dans Réglages).
Le code des fonctions est dans `supabase/functions/`. Les clés serveur sont dans la table `secrets_serveur`, illisible pour les clients.
