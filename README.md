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
| | Revue hebdo | Captures, retards, projets sans suite, charge, abonnements, énergie et charge sur 7 jours, facteur d'estimation, checklist |
| Vie | Transports | Trajets de la semaine, responsable et statut, génération de la semaine type |
| | Véhicules | Programme d'entretien saisonnier, interventions, pneus montés, dépenses |
| | Achats | Liste par magasin, commandes à recevoir, historique |
| | Abonnements | Budget mensuel et annuel, facturations et fins d'essai à venir |
| | Bibliothèque | En lecture, prochain livre, avis, terminés |
| | Routines | Habitudes, cible et réalisations sur 7 jours |
| Repères | Carnet | Notes, idées, comptes rendus, décisions, bilans |
| | Organigramme | Postes et hiérarchie, unités, titulaires |
| | Personnes et domaines | Répertoire et domaines de vie |
| | Réglages | Notifications, calendriers importés (Google, Outlook) et flux ORBITE, sauvegardes, Jira, hors ligne |

L'accueil commence par les **événements du jour** (avec la charge de 8 h à 17 h et les plages libres), les **conflits** entre un trajet à ta charge et un rendez-vous (avec délégation en un geste), puis l'alerte **pneus d'hiver** en octobre et novembre (selon la météo). Ensuite **Aujourd'hui, je fais** : au plus trois actions choisies pour la journée.

**Équilibre travail et vie** (lot 6) :
- **Fermer ma journée** : dès 16 h 30 en semaine (notification à 17 h 15), un rituel de deux minutes : victoires du jour (avec la durée réelle des tâches estimées), un prochain geste pour chaque tâche inachevée (demain dans mes trois, plus tard ou tel quel), de quoi je suis fier, énergie de 1 à 5. Table `journal_jours`. La fin de semaine, version courte « Comment était ta journée ? ».
- **Mode hors travail** : la fin de semaine, après 17 h ou une fois la journée fermée, l'accueil masque les tâches et projets de travail (domaines listés dans le réglage `domaines_travail`, ou référence Jira). Les événements restent. Bascule manuelle valable jusqu'à minuit.
- **Placer mes actions** : chaque action du plan du jour reçoit une heure dans une plage libre (proposition automatique) et apparaît en hachuré dans la barre de charge.
- **Estimé contre réel** : durée prévue et durée réelle sur chaque tâche; le facteur personnel ajuste les durées proposées et s'affiche dans la revue hebdo.
- **Limite des tâches en cours** : avertissement au-delà de 3 (réglage `limite_en_cours`).
- Réglages facultatifs : `fermeture_heure` (17 par défaut).

**Trajets et agenda** : un événement qui chevauche un trajet et nomme un enfant ou un geste de transport (pick-up, récupérer, déposer…) est reconnu comme ce trajet. Ce n'est pas un conflit, il s'affiche « À l'agenda » (avec « C'est moi » si personne n'est inscrit), et le rappel de 15 minutes n'est envoyé qu'une fois.

**Thèmes** : dans Plus, choix entre ORBITE (anthracite et orange) et Cyberpunk (néon magenta et cyan, fichier `theme-cyberpunk.css` chargé par-dessus `styles.css`). Le choix est gardé dans le réglage `theme` et suit le compte sur tous les appareils.

**Fait sur le fly** : le petit bouton ⚡ au-dessus du « + » (raccourci F) consigne une tâche faite sans être planifiée, déjà terminée, avec le temps passé, le domaine (Travail par défaut pendant les heures de travail) et une note. Colonne `actions.sur_le_fly`. Elles comptent comme victoires dans le rituel de fermeture, se filtrent dans Actions (« ⚡ Faites sur le fly ») et sont totalisées dans la revue hebdo.

**Interruptions (support opérationnel)** : touche **I** (ou ⚡ puis « C'est une interruption ») pour consigner en deux clics une demande de support : département, type de demande, demandeur, temps passé. Domaine Travail imposé. Colonnes `actions.interruption`, `interruption_dept`, `interruption_type`, `demandeur`. La revue hebdo affiche le bloc « Interruptions · 7 jours » (par département, type et demandeur, comparé à la semaine précédente, % d'une semaine de travail selon le réglage `heures_travail_semaine`, 40 par défaut) avec un bouton « Copier le résumé » pour un courriel. Filtre « 🚨 Interruptions » dans Actions.

**Carnet et cahiers** : les notes peuvent être rangées dans des cahiers (table `cahiers`, colonne `notes.cahier_id`), facultatif. Un cahier ou une note peut être lié à un projet et à une tâche (`action_id`). La fiche d'un projet et la fiche d'une tâche affichent leurs notes et cahiers liés, avec « + Note » et « + Cahier » pour en créer directement.

Autres outils :
- **Recherche globale** : Ctrl+K ou / sur ordinateur, loupe dans le bandeau sur téléphone.
- **Compte rendu** depuis un événement : note liée au projet; les lignes « - [ ] … » deviennent des tâches.
- **Classement automatique** (Réglages) : un mot-clé dans le titre d'un événement le relie à un projet.
- **Ligne de temps** des jalons dans chaque projet.
- **Achats reliés au budget** : un achat commandé engage le poste, reçu il le passe à « Payé »; photo ou PDF de facture en stockage privé `factures`.

Capture rapide : bouton orange, ou touche **N** sur ordinateur (tâche, événement, jalon, rappel, achat, note).

Données importées de Notion le 6 novembre 2026 (colonne `notion_id` pour la traçabilité).

## Automatisations (Supabase)

| Tâche programmée | Quand (heure de Toronto) | Fonction |
| --- | --- | --- |
| Événements passés → Terminé; trajets passés qui ne sont pas à ma charge → Fait | Aux 15 minutes (et à l'ouverture de l'app) | `prive.terminer_evenements_passes()`, `prive.terminer_trajets_passes()` |
| Semaine type des transports | Dimanche soir | `prive.generer_semaine_type()` |
| Notifications du matin et du soir (avec conflits de demain), invitation à fermer la journée | Chaque heure à :15 | Edge Function `rappels` |
| Rappel 15 min avant chaque événement et trajet | Aux 5 minutes | Edge Function `rappels` (`{"mode":"rdv"}`), sans doublon grâce à `rappels_envoyes` |
| Import des calendriers iCal (Google, Outlook…) | Chaque heure à :45 | Edge Function `outlook`, liens dans le réglage `calendriers_ics` |
| Statut Jira | Chaque heure, jours de semaine | Edge Function `jira` (inactive sans `JIRA_COURRIEL` et `JIRA_JETON`) |
| Sauvegarde complète (12 conservées) | Dimanche matin | Edge Function `sauvegarde` → stockage privé `sauvegardes` |

Flux iCalendar pour Outlook : Edge Function `calendrier?jeton=…` (lien dans Réglages).
Le code des fonctions est dans `supabase/functions/`. Les clés serveur sont dans la table `secrets_serveur`, illisible pour les clients.
