# LogiStock — maquette interactive

Maquette **front uniquement** de LogiStock, l'application de gestion des préfinancements et des achats de **soja** et de **cacao** au Togo : besoins, propositions, contrats, remises d'argent avec reçu, transports suivis lot par lot, livraisons partielles, reliquats recalculés, paiements et dettes.

> **Données fictives — démo.** Les noms, numéros, montants et photos sont inventés. Aucune donnée réelle n'est collectée et rien n'est envoyé sur Internet : tout reste dans le navigateur.

- Next.js 16 (App Router), React 19, TypeScript 5, export statique (`output: "export"`).
- Tailwind CSS 4, dépendance npm locale compilée au build (aucun CDN).
- Police Inter et icônes Lucide embarquées localement. **Aucune requête externe** au chargement (vérifié par les tests).
- SweetAlert2 pour toutes les confirmations, validations, erreurs et notifications (toasts).
- jsPDF pour les reçus de remise d'argent.

## Lancer en local

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev        # http://localhost:3000 (développement)
```

Version de production (identique à Vercel) :

```bash
npm run build      # génère le site statique dans out/
npm start          # sert out/ sur http://localhost:4173
```

L'application s'ouvre directement sur l'écran de connexion. Il n'y a pas de page d'accueil publique.

## Comptes de démo

Sur l'écran de connexion, les boutons de **connexion rapide** remplissent le formulaire à votre place. Vous pouvez aussi saisir l'e-mail ou le téléphone, et le mot de passe. Le numéro est accepté avec ou sans indicatif (`90 11 22 33`, `+228 90 11 22 33`, `00228 90 11 22 33`).

| Rôle | Nom | E-mail | Téléphone (+228) | Mot de passe |
|---|---|---|---|---|
| Patron (financeur) | Komlan Agbéko | `komlan.agbeko@example.com` | 90 11 22 33 | `patron2026` |
| Gestionnaire délégué (Kaboli) | Yawa Dossou | `yawa.dossou@example.com` | 91 22 33 44 | `gestion2026` |
| Fournisseur (cacao, Badou) | Kossi Amegah | `kossi.amegah@example.com` | 92 33 44 55 | `fourni2026` |
| Gestionnaire délégué (Lomé) | Edem Kpodar | `edem.kpodar@example.com` | 91 55 66 77 | `gestion2026` |
| Fournisseuse (soja, Atakpamé) | Jamilana Issifou | `jamilana.issifou@example.com` | 92 66 77 88 | `fourni2026` |
| Fournisseuse (soja, Notsé) | Afi Lawson | `afi.lawson@example.com` | 93 44 55 66 | `fourni2026` |

Les trois derniers comptes se trouvent sous « Autres comptes de démo ». Quand le patron crée un compte fournisseur, l'application affiche un mot de passe provisoire `LS-xxxx`. À sa première connexion, le fournisseur doit le changer.

**Astuce de présentation :** chaque onglet garde sa propre session. Ouvrez un rôle par onglet, ou une fenêtre côte à côte : les actions d'un rôle apparaissent en direct chez les autres, avec un toast et un badge sur la cloche.

**Réinitialiser la démo** remet toutes les données fictives d'origine. Le bouton se trouve en bas de la barre latérale sur ordinateur, ou dans Profil sur mobile.

Le déroulé conseillé pour une présentation au client est dans [PARCOURS_DEMO.md](./PARCOURS_DEMO.md) (environ 10 minutes).

## Ce que montre la maquette

| Étape | Écran | Qui |
|---|---|---|
| 0. Besoin et propositions | Besoins et propositions : le patron publie, les fournisseurs proposent, le patron valide, ce qui crée le contrat | Patron (publie, valide), fournisseurs (proposent) |
| 1. Remise d'argent | Fiche contrat → Remise d'argent : photo obligatoire, reçu PDF, partage, impression | Patron, gestionnaire |
| 2. Achat et stock | Déclarer → Achat : stock déclaré chez le fournisseur | Fournisseur |
| 3. Transport | Nouveau transport : véhicule, plaque TG-1234-AB, chauffeur, livreur, tonnage | Patron, gestionnaire |
| 4. Étapes du lot | Fiche transport → Ajouter une étape : timeline horodatée et chaînée | Tous |
| 5. Pointage à Lomé | Pointer l'arrivée à Lomé : contrôle de la plaque et du coût de transport, imputé au patron ou au solde du fournisseur | Patron, gestionnaire |
| 6. Pesée et réception | Pesée et réception : poids net, prix figé, valeur livrée | Patron, gestionnaire |
| 7. Solde | Solder : soldé, ou passage en dette ; remboursements | Patron |
| Livraison partielle | Déclarer → Livraison partielle : notification « 80 t sur 100 t — reliquat 20 t » | Fournisseur |
| Ajustement du reliquat | Ajuster le prix du reliquat : option A (même montant, quantité recalculée) ou B (même quantité, complément à verser) | Patron (gestionnaire sur validation) |

Le reste à livrer est toujours recalculé à partir des écritures :

```
S = A − V − R + T     (avances − valeur livrée − remboursements + transport imputé au fournisseur)
Q = ⌊ S / P ⌋         (P = prix en vigueur)
```

Exemple du cahier des charges : 10 000 000 FCFA à 215 FCFA/kg, puis 35 t livrées. Il reste 11 511 kg ; après révision à 300 FCFA/kg, il reste 8 250 kg.

### Rôles et droits

- **Patron** : voit tout, valide, supprime, gère les comptes fournisseurs et les droits.
- **Gestionnaire délégué** : crée et modifie selon ses droits, mais **ne supprime jamais directement**. Ses suppressions et ses changements sensibles (prix du reliquat) partent dans **Actions à confirmer**, où le patron valide ou refuse avec un motif.
- **Fournisseur** : application mobile (navigation basse). Il voit ses contrats, ses reçus, son reste à livrer et ses transports, déclare ses achats, confirme les étapes de ses lots et déclare ses livraisons partielles, et propose sur les besoins ouverts.

Le patron règle les droits de création, de lecture, de modification et de suppression du gestionnaire et du fournisseur, entité par entité, dans **Rôles et droits**. Les modifications s'appliquent en direct dans les autres onglets.

## Charte graphique

Bleu, noir et blanc uniquement, **sans aucun dégradé** : bleu `#1f4fd8`, noir encre `#0b0d12`, blanc, et gris neutres pour les bordures et les fonds. Un vert `#177245` et un rouge `#b42318` très discrets servent uniquement de témoins d'état : badges « Validé », « Photo manquante », « Échu », « Écart » et alerte de plaque non conforme. Les fenêtres et les toasts SweetAlert2 suivent ce thème (`src/app/globals.css`, section SweetAlert2).

## Architecture

```
src/
  app/                 écrans (App Router) ; (app)/ = écrans connectés, page.tsx = connexion
  components/          interface : ui.tsx (design system), AppShell, domain.tsx (fenêtres métier), alerts.ts (SweetAlert2)
  services/actions.ts  règles métier : chaque action vérifie les droits, écrit, journalise et notifie
  lib/                 types des entités, calculs (reliquat, révisions), droits, formats FCFA, reçu PDF, données de démo
  data/
    contracts.ts       interfaces Repository<T> par entité, PhotoStore, SessionStore, DataSource
    local/             implémentation localStorage + IndexedDB (photos) : seul code qui touche au stockage du navigateur
    http/              implémentation HTTP pour l'API Spring Boot
    index.ts           choisit l'implémentation (NEXT_PUBLIC_API_URL)
e2e/                   tests Playwright de bout en bout
```

Les composants n'accèdent jamais à `localStorage` : ils lisent l'état via `useData()` et agissent via `services/actions.ts`, qui passe par les dépôts (`Repository<T>`). La synchronisation entre onglets utilise l'événement `storage` et un `BroadcastChannel`.

## Brancher l'API Spring Boot

La maquette est prête à basculer vers un backend sans toucher aux écrans.

1. **Activer la source HTTP** : définir la variable au build (dans `.env.local` ou dans les variables d'environnement Vercel) :
   ```bash
   NEXT_PUBLIC_API_URL=https://api.logistock.example
   ```
   `src/data/index.ts` instancie alors `HttpDataSource` à la place de `LocalDataSource`.
2. **Contrat REST attendu** (préfixe `/api/v1`, voir `ENDPOINTS` dans `src/data/http/httpDataSource.ts`). Pour chaque ressource :
   - `GET /api/v1/{ressource}` → liste ;
   - `GET /api/v1/{ressource}/{id}` → détail ;
   - `POST /api/v1/{ressource}` → création ;
   - `PATCH /api/v1/{ressource}/{id}` → modification partielle.
   
   Ressources : `users`, `needs`, `offers`, `contracts`, `price-revisions`, `advances`, `locations`, `transports`, `lot-trace-events`, `arrival-checkins`, `deliveries`, `partial-deliveries`, `declarations`, `repayments`, `expenses`, `debts`, `notifications`, `pending-actions`, `audit-log`, `settings`. Fichiers : `POST /api/v1/files` renvoie `{ ref }`. Les JSON suivent les interfaces de `src/lib/types.ts`, avec des montants en FCFA entiers, des poids en kg entiers et des dates ISO 8601.
3. **Côté Spring Boot** : une entité JPA et un `@RestController` par interface de `types.ts`. Il faut aussi activer le CORS pour le domaine Vercel et une authentification JWT : l'implémentation envoie `Authorization: Bearer <token>`. Le point d'entrée de connexion est à brancher dans `HttpDataSource.session`.
4. **Règles à porter côté serveur** : en production, le serveur doit refaire tous les calculs et contrôles, car le navigateur ne peut pas en être le garant. Cela couvre le reliquat et les révisions (`lib/calc.ts`), les droits (`lib/permissions.ts`), le refus de suppression pour le gestionnaire et la mise en file des actions sensibles (`services/actions.ts`), le prix figé à la réception, l'annulation par contre-écriture, le journal chaîné et la signature des reçus (SHA-256 et Ed25519 dans le cahier des charges ; la maquette utilise une empreinte FNV de démonstration).
5. **Temps réel** : la source HTTP interroge l'API toutes les 10 secondes. Elle peut être remplacée par SSE ou WebSocket dans `subscribe()`.
6. « Réinitialiser la démo » n'existe qu'en mode local.

## Déployer sur Vercel

Le projet est un site statique. Vercel détecte Next.js automatiquement :

1. Importer le dépôt GitHub dans Vercel (framework : Next.js, commande `npm run build`).
2. Aucune variable d'environnement n'est nécessaire pour la démo. Ajouter `NEXT_PUBLIC_API_URL` seulement pour brancher l'API.
3. Les routes de détail utilisent des paramètres (`/contrats/fiche/?id=…`), ce qui rend toutes les pages compatibles avec l'export statique. Le dossier `out/` peut aussi être servi par n'importe quel hébergement statique.

## Tests

```bash
npm run build && npm start                # dans un premier terminal
npx playwright install chromium           # une seule fois
npm run test:e2e                          # dans un second terminal
```

`e2e/parcours.mjs` déroule le parcours complet sur les 3 rôles, dans des onglets ouverts en parallèle, et fait 39 vérifications :

- validation d'une proposition et création du contrat ;
- remise avec photo et reçu PDF ;
- pointage, pesée et réception ;
- livraison partielle 80/100 t ;
- ajustement 200 → 250 FCFA/kg qui ramène le reliquat de 20 t à 16 t, et exemple 11 511 kg → 8 250 kg ;
- mise en file des actions du gestionnaire et leur validation ;
- droits appliqués en direct ;
- création d'un compte fournisseur et première connexion ;
- passage en dette ;
- réinitialisation ;
- absence de requête externe et d'erreur JavaScript.

`e2e/mobile-debordement.mjs` vérifie qu'aucun écran ne déborde horizontalement à 360 px. Les captures sont écrites dans `e2e/captures/`, qui n'est pas versionné.
