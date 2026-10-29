// Politique de localisation. Toute modification du texte incrémente LOCATION_POLICY_VERSION :
// les consentements d'une version antérieure ne couvrent plus l'usage.
// 2026-10-20.1 évoquait à tort des envois d'argent dans l'application.
// 2026-10-20.2 précisait la hiérarchie de suivi.
// 2026-10-20.3 retire ces formulations et décrit le partage de lien.

export const LOCATION_POLICY_VERSION = "2026-10-20.3";

export interface PolicySection {
  title: string;
  paragraphs: string[];
}

export const LOCATION_POLICY: PolicySection[] = [
  {
    title: "Version et responsable",
    paragraphs: [
      `Version ${LOCATION_POLICY_VERSION}. Elle remplace la version 2026-10-20.2. Les textes antérieurs, qui évoquaient à tort des envois, des retraits ou des règlements réalisés dans l'application, ne sont plus en vigueur.`,
      "MarockStock sert à noter ce qui a déjà été remis ou transmis en dehors de l'application : argent remis en main propre, colis, produits. L'application n'envoie pas d'argent et n'exécute aucun règlement.",
      "Le responsable du traitement, dans cette maquette, est le patron financeur. En production, ce sera la personne morale qui exploite MarockStock au Togo.",
    ],
  },
  {
    title: "À quoi sert la position",
    paragraphs: [
      "La position de l'appareil n'est lue que si vous avez accepté cette version du texte, et seulement pendant que l'application est ouverte. Rien n'est collecté lorsque l'application est fermée : le navigateur ne le permet pas.",
      "Elle est utilisée pour la sécurité des écritures, la lutte contre la fraude et le suivi des livraisons. Concrètement : à chaque connexion (heure, compte, position et précision, ou le motif d'un échec) ; lorsque vous enregistrez une remise ou une transmission dans le journal (remise déjà faite hors de l'application, chargement, étape, arrivée, déclaration) ; lorsque vous modifiez un compte.",
      "Pendant une livraison en cours, la position du livreur ou du fournisseur est montrée sur la fiche de cette livraison, tant que leur application reste ouverte.",
    ],
  },
  {
    title: "Qui peut voir la position en direct",
    paragraphs: [
      "Le patron peut suivre tous les employés côté acheteur : gestionnaires, comptable, administrateur, magasinier, chauffeur. Il ne suit pas les comptes fournisseurs au titre de ce contrôle, ni son propre compte.",
      "Un gestionnaire ne suit que les employés rattachés à son équipe. Le comptable ne suit que les personnes que le patron a placées dans son périmètre. Ces limites sont appliquées par le programme, pas seulement en masquant un bouton.",
      "Chaque activation exige un motif. Le suivi s'arrête au plus tard au bout de 30 jours. Vous voyez un bandeau tant qu'il est actif : « Localisation partagée pour vérification de sécurité ». L'activation, chaque consultation et l'arrêt sont écrits dans le journal d'audit, avec l'auteur et le motif.",
      "En cas de suspicion de fraude, la personne autorisée consulte la position en direct pendant que votre session est ouverte. Dès que vous fermez l'application, les nouvelles positions cessent.",
    ],
  },
  {
    title: "Partage d'un lien temporaire",
    paragraphs: [
      "Seul le patron, ou une personne qu'il a explicitement autorisée pour ce suivi, peut créer un lien de consultation. Le destinataire est nommé et le motif est obligatoire.",
      "La durée est choisie au moment de la création : 2 heures par défaut, 24 heures au maximum. Le lien ouvre une carte en lecture seule. Il peut être révoqué à tout moment. Il cesse aussi de fonctionner dès que le suivi s'arrête.",
      "La création, chaque ouverture et la révocation sont tracées dans le journal d'audit. Le bandeau sur votre écran indique qu'un lien de consultation est actif.",
    ],
  },
  {
    title: "Durées de conservation",
    paragraphs: [
      "Preuve de consentement (identité, date, version du texte, signature, user-agent) : 5 ans après le retrait ou la clôture du compte.",
      "Journal de connexion et positions associées : 12 mois.",
      "Position jointe à une remise, une transmission ou une modification de compte : 5 ans, avec la ligne du journal d'audit.",
      "Positions d'un suivi de sécurité : le temps du suivi (30 jours au plus), puis la trace d'audit est conservée 12 mois.",
      "Position d'une livraison en cours : jusqu'à la clôture du lot, puis 12 mois.",
      "Lien de partage : le temps choisi (24 heures au plus). La trace de création, d'ouverture et de révocation est conservée 12 mois.",
    ],
  },
  {
    title: "Vos droits",
    paragraphs: [
      "Cette collecte repose sur votre consentement, au sens de la loi togolaise n°2019-014 du 29 octobre 2019 relative à la protection des données à caractère personnel.",
      "Vous pouvez retirer votre consentement à tout moment depuis la page Confidentialité / localisation. Le retrait est horodaté. Il bloque les enregistrements de remise, les transmissions et les modifications de compte, et il interrompt l'envoi de nouvelles positions.",
      "Vous consultez votre historique de connexions. Vous pouvez demander l'accès à vos données et leur rectification auprès du patron. Vous pouvez aussi saisir l'Instance de protection des données à caractère personnel (IPDCP).",
      "Si le navigateur refuse la localisation, l'application vous le dit clairement. L'écriture est tout de même notée, avec la mention que la position n'a pas pu être capturée.",
    ],
  },
];

export interface ConsentLike {
  userId: string;
  policyVersion: string;
  granted: boolean;
  at: string;
  deleted?: boolean;
}

export function latestConsent(list: readonly ConsentLike[], userId: string, version = LOCATION_POLICY_VERSION) {
  return list
    .filter((c) => c.userId === userId && c.policyVersion === version && !c.deleted)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function consentGranted(list: readonly ConsentLike[], userId: string, version = LOCATION_POLICY_VERSION) {
  return latestConsent(list, userId, version)?.granted === true;
}
