# Parcours de démonstration — environ 10 minutes (+ 6 minutes pour les nouveaux rôles)

Ce parcours couvre tout le cycle d'un achat financé, des étapes 0 à 7, avec la livraison partielle et le recalcul du reliquat. Les parties 1 à 9 utilisent le patron, la gestionnaire et le fournisseur. Les parties 10 à 15 montrent l'administratrice, le chauffeur, le magasinier, le comptable, le mode hors ligne et la vérification d'un reçu. Toutes les données sont **fictives**.

## Préparation (1 minute avant le client)

1. Ouvrez l'application (`npm run dev`, ou l'URL Vercel). Vous arrivez sur l'écran de connexion.
2. Ouvrez **trois onglets**, idéalement deux fenêtres côte à côte avec un téléphone ou le mode mobile du navigateur pour le fournisseur :
   - **Onglet 1 — Patron** : « Connexion rapide » → **Patron** (Komlan Agbéko).
   - **Onglet 2 — Gestionnaire** : « Connexion rapide » → **Gestionnaire délégué** (Yawa Dossou).
   - **Onglet 3 — Fournisseur**, en affichage mobile : « Connexion rapide » → **Fournisseur** (Kossi Amegah).
3. Si une démo précédente a modifié les données, cliquez sur **Réinitialiser la démo**. Le bouton est en bas de la barre latérale, ou dans Profil sur mobile.

> Message à faire passer : *chaque franc avancé et chaque tonne livrée sont tracés, et le reste à livrer se recalcule tout seul.*

---

## 1. Le tableau de bord du patron — 1 min · Onglet 1

- **Accueil** : total avancé, total livré, soldes ouverts, stock disponible, charges, dettes, transports en cours et actions à confirmer.
- Filtrez par **produit** (liste issue du catalogue du patron : soja, cacao, etc.) ou par fournisseur.
- Montrez le bloc **À traiter**. Il contient une demande de suppression envoyée par la gestionnaire et un contrat échu non soldé.
- Le tableau des contrats affiche pour chacun la réalisation, le prix en vigueur et le **reste à livrer**.

## 2. Étape 0 : du besoin au contrat — 1 min 30 · Onglet 1

1. Menu **Besoins et propositions**. Le besoin **BS-2026-021** porte sur 500 t de soja à 350 FCFA/kg, et deux fournisseurs ont proposé.
2. Sur la proposition d'**Afi Lawson** (500 t), cliquez **Valider**. La fenêtre du contrat est préremplie : tonnes, prix, lieu, date de livraison, et la case « transport payé par le patron ».
3. Cliquez **Valider et créer le contrat**. La confirmation SweetAlert s'affiche, puis la fiche du nouveau contrat s'ouvre avec la fenêtre **Remise d'argent**.

## 3. Étape 1 : remise d'argent et reçu — 1 min · Onglet 1

1. Le montant est prérempli : **175 000 000 FCFA**, soit 500 t × 350.
2. Photo de la remise : prenez une photo, choisissez un fichier, ou cliquez la vignette **« Remise d'espèces »** (photo de démo).
3. Cliquez **Enregistrer et générer le reçu**. Le **reçu PDF** se télécharge. Il contient la quantité, le prix unitaire, le résumé du contrat, la photo, la place des signatures et l'empreinte.
4. Sur la remise, montrez **Partager** et **Imprimer**.
5. Si une remise n'a pas de photo, elle reste « à compléter » et une alerte est envoyée.

## 4. Étapes 3 à 6 : le lot en route, le pointage et la pesée — 2 min · Onglet 2 puis 1

1. **Onglet 2 (gestionnaire)**, menu **Transports et lots**, ouvrez **TR-2026-041** : 80 t de cacao de Kossi.
2. Montrez la **timeline du lot** : Badou, chargement, Kaboli, Atakpamé. Chaque étape indique l'heure, le réceptionnaire, le véhicule et la photo.
3. Optionnel : **Ajouter une étape**, par exemple un passage à Tsévié.
4. Cliquez **Pointer l'arrivée à Lomé**. La plaque est contrôlée (TG-5520-CA). Saisissez le coût du transport, par exemple 450 000 FCFA. Le contrat indique que le transport est payé par le patron, donc le coût part dans ses charges.
   → **Basculez sur l'onglet 1** : le patron a reçu un **toast** « Véhicule pointé à Lomé » et la cloche affiche un badge.
5. Retour sur l'onglet 2 : **Pesée et réception**. Le poids net est de 80 t, le prix est **figé** à 200 FCFA/kg, la valeur livrée est de 16 000 000 FCFA. Le reste à livrer passe de **100 t à 20 t**.

## 5. Livraison partielle — 1 min · Onglet 3 (mobile)

1. Accueil du fournisseur : il voit son reste à livrer, son solde à couvrir et ses contrats.
2. Sur **CT-2026-017**, cliquez **Livraison partielle**. Saisissez 80 t trouvées sur 100 t, un motif, et une photo (vignette « Ticket de pesée »).
3. Cliquez **Déclarer et notifier le patron**. Le patron reçoit **« Livraison partielle : 80 t sur 100 t — reliquat 20 t »** dans l'onglet 1.

## 6. Ajustement du prix du reliquat — 1 min 30 · Onglet 1

1. Cliquez le toast, ou ouvrez **Contrats → CT-2026-017**. Le bandeau de livraison partielle est affiché avec la preuve.
2. La **carte de calcul** détaille A, V, R, J et T, puis S = A − V − R − J + Tf et Q = S / P. Le reste à livrer est de **20 t**.
3. Cliquez **Ajuster le prix du reliquat** et saisissez **250 FCFA/kg** :
   - **Option A**, même argent : le reliquat devient **16 t**.
   - **Option B**, même quantité : 20 t restent dues, avec un **complément de 1 000 000 FCFA** à verser.
4. Choisissez A, donnez un motif, puis cliquez **Appliquer et notifier**. Le reste à livrer passe à **16 t**, et l'historique des prix et le relevé sont mis à jour.
   → **Onglet 3** : le fournisseur reçoit la révision en direct et voit 16 t.
5. Optionnel, l'exemple du cahier des charges : sur **CT-2026-014**, 215 → 300 FCFA/kg fait passer le reste de **11 511 kg à 8 250 kg**.

## 7. Le gestionnaire ne supprime jamais — 1 min · Onglets 2 et 1

1. **Onglet 2** : sur un transport, cliquez **Demander la suppression** et donnez un motif. La demande part en validation et le transport reste visible.
2. Toujours en gestionnaire, sur un contrat : **Ajuster le prix du reliquat** → **Envoyer au patron pour validation**. Le changement est **envoyé au patron**, il n'est pas appliqué.
3. **Onglet 1**, menu **Actions à confirmer** : chaque demande affiche son motif, son auteur et sa date. Cliquez **Valider** sur l'une et **Refuser** sur une autre, avec un motif. La gestionnaire est notifiée de chaque décision.
4. Après approbation, la suppression est **logique** : l'élément disparaît des listes mais reste dans le **Journal d'audit**.

## 8. Rôles, droits et comptes — 1 min · Onglet 1

1. **Rôles et droits** : la matrice création / lecture / modification / suppression par entité, pour le gestionnaire et le fournisseur. Pour la suppression, le gestionnaire n'a que deux réglages : *interdite* ou *via « Actions à confirmer »*. Il n'a jamais de suppression directe (US-20).
2. Réglez la suppression des **transports** sur *interdite* pour le gestionnaire. Dans l'onglet 2, le bouton « Demander la suppression » **disparaît sans recharger la page**.
3. **Comptes → Créer un compte fournisseur** : le patron crée le compte et reçoit un mot de passe provisoire. Le fournisseur devra le changer à sa première connexion.

## 9. Étape 7 : solde ou dette — 30 s · Onglet 1

1. **CT-2026-009** (Afi) est échu. Il reste 180 000 FCFA de transport imputé au fournisseur.
2. Cliquez **Solder** : remboursement partiel, ou clôture par remboursement, report sur un autre contrat ou dette. Choisissez **Clore : dette** et fixez une échéance.
3. La dette apparaît dans **Paiements et dettes**, classée par ancienneté. On peut y **encaisser** un remboursement, en argent ou en marchandise. Le patron peut aussi passer une perte signée.

## 10. Administratrice — 1 min · nouvel onglet

1. « Connexion rapide » → **Administratrice** (Akouvi Mensah). L'accueil affiche les comptes actifs et bloqués, les appareils autorisés et les opérations en attente.
2. **Utilisateurs → Nouveau compte** : créez un magasinier. Le mot de passe provisoire s'affiche et devra être changé à la première connexion. Montrez aussi l'onglet **Appareils**.
3. **Paramètres** : seuils d'alerte, sécurité (nombre d'échecs, durée de blocage), prix de revente, **règles de commission** par contrat, véhicules, chauffeurs et lieux avec leurs coordonnées.
4. **Rôles et droits** : un onglet par rôle, en lecture seule pour l'administratrice. Les cadenas signalent les règles non modifiables.

## 11. Verrouillage et code PIN — 1 min · onglet mobile

1. Sur l'écran de connexion, saisissez **90 33 44 55** avec un mauvais mot de passe cinq fois. Au 5e échec, le compte est **bloqué 15 minutes**. Dans l'onglet de l'administratrice, un toast « Compte bloqué » apparaît.
2. Administratrice → **Utilisateurs** → **Débloquer**. La comptable peut de nouveau se connecter, et le journal trace le blocage et le déblocage.
3. Connectez le **Chauffeur** (Yao Gbadoé). Un bandeau invite à définir un **code PIN** : Profil → Définir un code PIN, par exemple 2580, deux fois.
4. Ouvrez un nouvel onglet sur l'écran de connexion. « Déverrouiller avec mon PIN » propose Yao, et le PIN suffit pour entrer, même hors ligne.

## 12. Chauffeur et magasinier — 1 min 30 · onglet mobile et onglet ordinateur

1. **Chauffeur** → **Mes trajets** → **PK-2026-006**. Les chargements chez Kossi sont confirmés, les étapes Kaboli et Atakpamé passées, et la carte du trajet est affichée.
2. **Confirmer le passage** à Tsévié, puis **Déclarer l'arrivée avec photo** (vignette « Chargement »).
3. Onglet **Magasinier** (Mawuli Tété) : un toast « Camion arrivé à Lomé » apparaît. **Réception et pesées** montre TR-2026-041 à pointer.
4. Ouvrez le lot. **Pointer l'arrivée**, puis **Peser** (brut, tare, sacs, humidité, photo du ticket). La livraison est réceptionnée à **200 FCFA/kg figés**, et le reste à livrer passe de 100 t à 20 t.
5. Menu **Carte des lots** : stocks chez les acheteurs et trajets en cours, sur un fond local qui fonctionne sans réseau.

## 13. Hors ligne — 1 min · onglet chauffeur

1. Cliquez l'indicateur **Synchronisé** en haut de l'écran, puis **Simuler hors ligne**. L'indicateur passe en noir : « Hors ligne ».
2. **Frais** : déclarez 35 000 FCFA de carburant avec un justificatif. Le message indique « en attente de synchronisation » et le compteur affiche 1.
3. Essayez une remise d'argent dans un onglet hors ligne : elle est refusée, car une opération financière exige le réseau.
4. **Rétablir le réseau** : la file part toute seule, sans doublon, et le patron reçoit les frais à valider.
5. Sur téléphone, installez l'application (« Ajouter à l'écran d'accueil »). Elle s'ouvre ensuite sans réseau.

## 14. Comptable, commissions, exports — 1 min

1. **Comptable** (Essi Kouma) : finances, dettes par ancienneté, commissions, charges et journal, en lecture seule. **Utilisateurs** affiche « Accès réservé ».
2. **Exports** : stocks, dettes et contrats en Excel ou en PDF, un classeur complet, et le **rapport mensuel** du patron en PDF, par mois et par produit.
3. Administratrice ou patron → **Commissions** : **Calculer** sur un contrat, puis **Valider**, puis **Payer**. Selon la règle, la commission est une dépense versée ou un ajustement J déduit du solde du fournisseur. Le fournisseur la voit dans son espace.

## 15. Vérifier un reçu — 30 s

1. Ouvrez un reçu PDF : son **QR code** mène à `/verifier/`, une page publique sans connexion. Vous pouvez aussi saisir le numéro, par exemple RC-2026-0038, et l'empreinte imprimée.
2. Le résultat indique **Reçu authentique** : l'empreinte SHA-256 est recalculée et la signature Ed25519 est valide.
3. **Simuler une falsification** : le montant est modifié de 1 000 000 FCFA et la vérification échoue.
4. Le bandeau rappelle que la clé est une **clé de démo**. En production, elle sera **côté serveur** et ne quittera jamais l'API.

## Conclusion — 30 s

- Tout est tracé : le **Journal d'audit** est chaîné en SHA-256, et la vérification d'intégrité tient en un clic. Les reçus sont signés en Ed25519 et vérifiables par n'importe qui.
- L'application est mobile d'abord pour le terrain (fournisseur, chauffeur, magasinier), installable et utilisable hors ligne, et complète sur ordinateur pour le patron, l'administratrice et la comptable.
- C'est une maquette : les données sont stockées dans le navigateur. Le branchement sur l'API Spring Boot est prévu, voir le README.
- **Réinitialiser la démo** permet de rejouer le parcours.
