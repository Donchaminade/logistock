# LogiStock — maquette interactive

Maquette **front uniquement** de LogiStock, l'application de gestion des préfinancements et des achats de **soja** et de **cacao** au Togo : besoins, propositions, contrats, remises d'argent avec reçu, transports suivis lot par lot, livraisons partielles, reliquats recalculés, paiements et dettes.

> **Données fictives — démo.** Les noms, numéros, montants et photos sont inventés. Aucune donnée réelle n'est collectée et rien n'est envoyé sur Internet : tout reste dans le navigateur.

- Next.js 16 (App Router), React 19, TypeScript 5, export statique (`output: "export"`).
- Tailwind CSS 4, dépendance npm locale compilée au build (aucun CDN).
- Police Inter et icônes Lucide embarquées localement. **Aucune requête externe** au chargement (vérifié par les tests).
- SweetAlert2 pour toutes les confirmations, validations, erreurs et notifications (toasts).
- jsPDF et jspdf-autotable pour les reçus, relevés, exports et le rapport mensuel ; write-excel-file pour les exports Excel (.xlsx générés dans le navigateur).
- @noble/hashes et @noble/curves (repli) pour SHA-256 et Ed25519 ; WebCrypto quand le navigateur le permet.
- Leaflet pour les cartes, avec un fond schématique local (aucune tuile chargée tant que l'utilisateur ne coche pas « Fond OpenStreetMap »).
- **PWA** installable : manifeste, icônes, service worker qui précache tout le site au build.

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

Sur l'écran de connexion, les boutons de **connexion rapide** remplissent le formulaire à votre place, un par rôle. Vous pouvez aussi saisir le numéro et le mot de passe à la main.

| Rôle | Nom | Téléphone (+228) | Mot de passe |
|---|---|---|---|
| Patron (financeur) | Komlan Agbéko | 90 11 22 33 | `patron2026` |
| Gestionnaire délégué (Kaboli) | Yawa Dossou | 91 22 33 44 | `gestion2026` |
| Fournisseur (cacao, Badou) | Kossi Amegah | 92 33 44 55 | `fourni2026` |
| Administratrice (comptes, paramètres) | Akouvi Mensah | 90 22 33 44 | `admin2026` |
| Magasinier (magasin central de Lomé) | Mawuli Tété | 94 11 22 33 | `magasin2026` |
| Chauffeur (TG-5520-CA) | Yao Gbadoé | 98 12 34 56 | `chauffeur2026` |
| Comptable (lecture et exports) | Essi Kouma | 90 33 44 55 | `compta2026` |
| Gestionnaire délégué (Lomé) | Edem Kpodar | 91 55 66 77 | `gestion2026` |
| Fournisseuse (soja, Atakpamé) | Jamilana Issifou | 92 66 77 88 | `fourni2026` |
| Fournisseuse (soja, Notsé) | Afi Lawson | 93 44 55 66 | `fourni2026` |

Les trois derniers comptes se trouvent sous « Autres comptes de démo ». Quand le patron crée un compte fournisseur, ou l'administratrice un compte interne, l'application affiche un mot de passe provisoire `LS-xxxx`. À sa première connexion, l'utilisateur doit le changer.

**Sécurité de connexion (US-01).**
- Après **5 échecs consécutifs** (valeur réglable dans Paramètres → Sécurité), le compte est bloqué 15 minutes. L'administratrice et le patron sont alertés, et l'administratrice peut débloquer depuis **Utilisateurs**.
- Les rôles mobiles (fournisseur, chauffeur, magasinier, gestionnaire) sont invités à définir un **code PIN** de 4 à 6 chiffres dans **Profil**. Le PIN est rattaché à l'appareil et stocké en SHA-256 salé, jamais en clair.
- Sur un appareil autorisé, l'écran de connexion propose « Déverrouiller avec mon PIN », y compris **hors ligne**. Cinq PIN erronés retirent l'autorisation de l'appareil.

> La branche `cursor/login-email-phone-b60f` (PR n° 1) ajoute la connexion par e-mail ou par téléphone international. Elle touche l'écran de connexion et la normalisation des numéros. Le présent travail n'y a ajouté que le strict nécessaire : PIN, message de blocage, avis hors ligne et boutons des nouveaux rôles. Les conflits éventuels lors de la fusion se limitent à `src/app/page.tsx`, `src/services/auth.ts` (fonction `login`) et `src/lib/seed.ts` (comptes).

**Astuce de présentation :** chaque onglet garde sa propre session. Ouvrez un rôle par onglet, ou une fenêtre côte à côte : les actions d'un rôle apparaissent en direct chez les autres, avec un toast et un badge sur la cloche.

**Réinitialiser la démo** remet toutes les données fictives d'origine. Le bouton se trouve en bas de la barre latérale sur ordinateur, ou dans Profil sur mobile.

Le déroulé conseillé pour une présentation au client est dans [PARCOURS_DEMO.md](./PARCOURS_DEMO.md) : environ 10 minutes pour le cœur, et 6 minutes de plus pour les nouveaux rôles.

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
| Enlèvement | Stocks → Planifier : ordre d'enlèvement (véhicule, chauffeur, arrêts, étapes), notifié au chauffeur et aux fournisseurs | Patron, gestionnaire, administratrice |
| Trajet du chauffeur | Mes trajets : chargement confirmé (sacs, photo), étapes, arrivée à Lomé avec photo, frais du véhicule | Chauffeur |
| Réception au magasin | Réception et pesées : camions annoncés, pointage, pesée (humidité, ticket), réception au prix figé | Magasinier |
| Commissions | Règle par contrat (par kg, % ou forfait ; versée ou déduite), calculée → validée → payée | Patron, administratrice |
| Livraison partielle | Déclarer → Livraison partielle : notification « 80 t sur 100 t — reliquat 20 t » | Fournisseur |
| Ajustement du reliquat | Ajuster le prix du reliquat : option A (même montant, quantité recalculée) ou B (même quantité, complément à verser) | Patron (gestionnaire sur validation) |

Le reste à livrer est toujours recalculé à partir des écritures :

```
S = A − V − R − J + Tf   (avances − valeur livrée − remboursements − ajustements + transport imputé au fournisseur)
Q = ⌊ S / P ⌋            (P = prix en vigueur)
```

Exemple du cahier des charges : 10 000 000 FCFA à 215 FCFA/kg, puis 35 t livrées. Il reste 11 511 kg ; après révision à 300 FCFA/kg, il reste 8 250 kg.

### Rôles et droits

| Rôle | Espace | Ce qu'il fait |
|---|---|---|
| **Patron** | ordinateur et mobile | Voit tout, valide, supprime, gère les comptes fournisseurs et les droits, valide et paie les commissions, passe les pertes. |
| **Gestionnaire délégué** | mobile et ordinateur | Crée et modifie selon ses droits, mais **ne supprime jamais directement**. Ses suppressions et ses changements sensibles (prix du reliquat) partent dans **Actions à confirmer**. |
| **Fournisseur** | mobile | Voit ses contrats, reçus, relevé, commissions et enlèvements. Déclare ses achats et ses livraisons partielles, et propose sur les besoins. |
| **Administratrice** | ordinateur | Gère les comptes internes (création, déblocage, réinitialisation, désactivation, appareils), les paramètres (seuils, sécurité, prix de revente, règles de commission), les véhicules, les chauffeurs et les lieux. Lit les droits sans les modifier. |
| **Magasinier** | mobile et tablette | Voit les camions annoncés, pointe, pèse (brut, tare, sacs, humidité, ticket) et réceptionne au prix figé. Consulte les stocks et la carte. |
| **Chauffeur** | mobile | Suit ses ordres d'enlèvement, confirme chargements et étapes, déclare l'arrivée avec photo et déclare ses frais. Tout fonctionne hors ligne. |
| **Comptable** | ordinateur | Lit les finances, dettes, commissions, charges et le journal. Exporte en Excel et en PDF, y compris le rapport mensuel. Aucun droit d'écriture. |

Le patron règle les droits de création, de lecture, de modification et de suppression de chaque rôle, entité par entité, dans **Rôles et droits**. Les modifications s'appliquent en direct dans les autres onglets. Les règles non négociables (pas de suppression directe pour le gestionnaire, pas d'accès aux comptes pour le comptable) sont signalées par un cadenas. Les écrans hors du rôle affichent « Accès réservé ».

### Hors ligne et PWA

- L'application est **installable** (« Ajouter à l'écran d'accueil ») et s'ouvre sans réseau. `npm run build` génère `out/sw.js` (`scripts/gen-sw.mjs`), qui précache toutes les pages, scripts, polices, icônes et images de démo, avec un cache versionné par empreinte du build.
- L'indicateur en haut de l'écran affiche **Synchronisé**, **Synchronisation…** ou **Hors ligne**, avec le nombre d'opérations en attente. Un clic permet de **simuler** une coupure dans l'onglet courant, de rétablir le réseau ou de synchroniser tout de suite.
- **Autorisé hors ligne** : déclarations d'achat, livraisons partielles, transports, étapes, chargements, arrivée, pointage, pesée et frais. Chaque saisie part dans une **file d'attente** avec une clé d'idempotence, puis est envoyée automatiquement au retour du réseau, sans doublon. Les notifications sont différées jusqu'à la synchronisation.
- **Réseau exigé** : remises d'argent, révisions de prix, réception au prix figé, remboursements, clôtures, paiements de commission et gestion des comptes.

### Intégrité : SHA-256 et Ed25519

- Chaque reçu de remise porte l'**empreinte SHA-256** de son contenu canonique et une **signature Ed25519**. Le reçu PDF contient l'empreinte et un QR code vers `/verifier/?no=…&h=…`.
- La page publique **Vérifier un reçu** (`/verifier/`, sans connexion) recalcule l'empreinte, vérifie la signature et compare l'empreinte imprimée. « Simuler une falsification » montre l'échec quand le montant est modifié.
- Le **journal d'audit** est chaîné : chaque ligne contient le SHA-256 de son contenu et de la ligne précédente. « Vérifier l'intégrité » recalcule la chaîne. La timeline de chaque lot est chaînée de la même façon.
- ⚠️ **Clé de démonstration** : dans la maquette, la clé privée Ed25519 de démo est embarquée dans le code (`src/lib/crypto.ts`) pour signer localement. **En production, la clé privée reste côté serveur** (HSM ou coffre de secrets). Le serveur signe et horodate, et le navigateur ne fait que vérifier avec la clé publique. La vérification de la maquette s'appuie aussi sur les données locales du navigateur ; en production, elle interrogera l'API.

### Exports, rapport mensuel et carte

- **Exports** : stocks, dettes et contrats en Excel (.xlsx) ou en PDF, plus un classeur complet. Le **rapport mensuel du patron** (PDF) se filtre par mois et par produit. Tout est généré dans le navigateur, sans serveur.
- **Carte des lots** et carte de chaque trajet : fond schématique local du Togo, lieux, stocks déclarés et trajets en cours. Le fond OpenStreetMap est facultatif. Il n'est demandé que si l'utilisateur coche la case et que le réseau est disponible ; sinon, la carte reste utilisable.

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
   
   Ressources : `users`, `needs`, `offers`, `contracts`, `price-revisions`, `advances`, `locations`, `transports`, `lot-trace-events`, `arrival-checkins`, `deliveries`, `partial-deliveries`, `declarations`, `repayments`, `expenses`, `debts`, `notifications`, `pending-actions`, `audit-log`, `settings`, `devices`, `vehicles`, `drivers`, `pickup-orders`, `adjustments`, `commissions`. Fichiers : `POST /api/v1/files` renvoie `{ ref }`. Les JSON suivent les interfaces de `src/lib/types.ts`, avec des montants en FCFA entiers, des poids en kg entiers et des dates ISO 8601.
3. **Côté Spring Boot** : une entité JPA et un `@RestController` par interface de `types.ts`. Il faut aussi activer le CORS pour le domaine Vercel et une authentification JWT : l'implémentation envoie `Authorization: Bearer <token>`. Le point d'entrée de connexion est à brancher dans `HttpDataSource.session`.
4. **Règles à porter côté serveur** : en production, le serveur doit refaire tous les calculs et contrôles, car le navigateur ne peut pas en être le garant. Cela couvre le reliquat et les révisions (`lib/calc.ts`), les droits (`lib/permissions.ts`), le refus de suppression pour le gestionnaire et la mise en file des actions sensibles (`services/actions.ts`), le prix figé à la réception, l'annulation par contre-écriture, le journal chaîné, l'horodatage et la signature Ed25519 des reçus et des révisions, avec une clé privée qui ne quitte jamais le serveur. La maquette signe localement avec une clé de démonstration.
5. **Temps réel** : la source HTTP interroge l'API toutes les 10 secondes. Elle peut être remplacée par SSE ou WebSocket dans `subscribe()`.
6. « Réinitialiser la démo » n'existe qu'en mode local.

## Déployer sur Vercel

Le projet est un site statique. Vercel détecte Next.js automatiquement :

1. Importer le dépôt GitHub dans Vercel (framework : Next.js, commande `npm run build`).
2. Aucune variable d'environnement n'est nécessaire pour la démo. Ajouter `NEXT_PUBLIC_API_URL` seulement pour brancher l'API.
3. Les routes de détail utilisent des paramètres (`/contrats/fiche/?id=…`), ce qui rend toutes les pages compatibles avec l'export statique. Le dossier `out/` peut aussi être servi par n'importe quel hébergement statique.

## Tests

```bash
npm run build && npm start                # dans un premier terminal (ou : cd out && python3 -m http.server 4173)
npx playwright install chromium           # une seule fois
npm run test:e2e                          # dans un second terminal
```

`npm run test:e2e` enchaîne trois scripts. Le dossier des captures se règle avec `SHOTS=…` ; par défaut, c'est `e2e/captures/`, qui n'est pas versionné.

`e2e/parcours.mjs` fait 39 vérifications. Il déroule le cycle complet patron, gestionnaire et fournisseur dans des onglets ouverts en parallèle :
- proposition validée, remise avec photo et reçu PDF ;
- pointage, pesée, livraison partielle 80/100 t ;
- ajustement 200 → 250 FCFA/kg (reliquat de 20 t à 16 t), et exemple 11 511 kg → 8 250 kg ;
- actions à confirmer, droits appliqués en direct ;
- création d'un compte fournisseur, passage en dette, réinitialisation.

`e2e/roles.mjs` fait 52 vérifications :
- **Signature** : vérification d'un reçu authentique, falsification détectée, empreinte imprimée erronée refusée.
- **Administratrice** : création de compte et matrice des droits.
- **Verrouillage** : 5 échecs, blocage, alerte en direct, déblocage, connexion, journal.
- **Comptable** : accès réservé, lecture seule, exports xlsx et PDF, rapport mensuel.
- **Commissions** : cycle calculée → validée → payée.
- **Chauffeur** : PIN, étape, arrivée avec photo, notification du magasinier.
- **Magasinier** : pointage, pesée, réception au prix figé, carte.
- **Journal** : chaîne intègre.
- **Hors ligne simulé** : frais en file d'attente, puis synchronisation automatique.
- **PIN** : déverrouillage, refus d'un PIN erroné.
- **PWA** : manifeste et service worker ; rechargement et navigation avec le réseau réellement coupé ; remise refusée hors ligne ; avis hors ligne à la connexion.

`e2e/mobile-debordement.mjs` vérifie qu'aucun écran des 7 rôles ne déborde horizontalement à 360 px.

Tous les scripts vérifient aussi l'absence de requête externe et d'erreur JavaScript.
