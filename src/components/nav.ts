import {
  Bell, BadgePercent, ClipboardCheck, Download, FileCheck2, FileText, Handshake, History, LayoutDashboard, LocateFixed, Map, MoreHorizontal, PackageCheck,
  PackagePlus, Receipt, Route, ScrollText, Settings, Shield, ShieldCheck, Truck, User as UserIcon, UserCog, Users, Wallet, Warehouse, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "pending" | "notifications";
}

const I = {
  accueil: { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
  besoins: { href: "/besoins/", label: "Besoins et propositions", icon: Handshake },
  contrats: { href: "/contrats/", label: "Contrats", icon: FileText },
  enlevements: { href: "/enlevements/", label: "Ordres d'enlèvement", icon: Route },
  transports: { href: "/transports/", label: "Transports et lots", icon: Truck },
  carte: { href: "/carte/", label: "Carte des lots", icon: Map },
  stocks: { href: "/stocks/", label: "Stocks", icon: Warehouse },
  reception: { href: "/reception/", label: "Réception et pesées", icon: PackageCheck },
  finances: { href: "/finances/", label: "Paiements et dettes", icon: Wallet },
  commissions: { href: "/commissions/", label: "Commissions", icon: BadgePercent },
  charges: { href: "/charges/", label: "Maintenance et charges", icon: Wrench },
  exports: { href: "/exports/", label: "Exports et rapport", icon: Download },
  actions: { href: "/actions/", label: "Actions à confirmer", icon: ClipboardCheck, badge: "pending" as const },
  fournisseurs: { href: "/fournisseurs/", label: "Comptes fournisseurs", icon: Users },
  utilisateurs: { href: "/utilisateurs/", label: "Utilisateurs", icon: UserCog },
  parametres: { href: "/parametres/", label: "Paramètres", icon: Settings },
  droits: { href: "/droits/", label: "Rôles et droits", icon: ShieldCheck },
  journal: { href: "/journal/", label: "Journal d'audit", icon: History },
  declarer: { href: "/declarer/", label: "Déclarer", icon: PackagePlus },
  releve: { href: "/releve/", label: "Mon relevé", icon: ScrollText },
  trajets: { href: "/trajets/", label: "Mes trajets", icon: Route },
  frais: { href: "/frais/", label: "Frais du véhicule", icon: Receipt },
  notifications: { href: "/notifications/", label: "Notifications", icon: Bell, badge: "notifications" as const },
  profil: { href: "/profil/", label: "Profil", icon: UserIcon },
  plus: { href: "/plus/", label: "Plus", icon: MoreHorizontal },
  personnel: { href: "/personnel/", label: "Personnel suivi", icon: LocateFixed },
  consentements: { href: "/consentements/", label: "Consentements", icon: FileCheck2 },
  confidentialite: { href: "/confidentialite/", label: "Confidentialité", icon: Shield },
  connexions: { href: "/connexions/", label: "Mes connexions", icon: History },
} satisfies Record<string, NavItem>;

const as = (i: NavItem, label: string): NavItem => ({ ...i, label });

export const SIDEBAR: Record<Role, { group: string; items: NavItem[] }[]> = {
  patron: [
    { group: "Pilotage", items: [I.accueil, I.besoins, I.contrats, I.enlevements, I.transports, I.carte, I.stocks, I.reception] },
    { group: "Finances", items: [I.finances, I.commissions, I.charges, I.exports] },
    { group: "Contrôle", items: [I.actions, as(I.fournisseurs, "Comptes"), I.utilisateurs, I.personnel, I.consentements, I.droits, I.parametres, I.journal] },
  ],
  admin: [
    { group: "Administration", items: [I.accueil, I.utilisateurs, I.personnel, I.consentements, I.parametres, I.droits, I.journal] },
    { group: "Opérations", items: [I.fournisseurs, I.besoins, I.contrats, I.enlevements, I.transports, I.carte, I.reception] },
    { group: "Finances", items: [I.finances, I.commissions, I.charges, I.exports, as(I.actions, "Actions à confirmer")] },
  ],
  gestionnaire: [
    { group: "Terrain", items: [I.accueil, I.contrats, I.enlevements, I.transports, I.carte, I.stocks, I.reception, as(I.besoins, "Besoins")] },
    { group: "Suivi", items: [I.personnel, as(I.actions, "Mes demandes"), as(I.fournisseurs, "Fournisseurs"), I.charges] },
  ],
  fournisseur: [
    { group: "Mon espace", items: [I.accueil, as(I.contrats, "Mes contrats"), I.declarer, I.releve, as(I.besoins, "Besoins du patron"), as(I.transports, "Mes transports"), as(I.commissions, "Mes commissions")] },
  ],
  magasinier: [
    { group: "Magasin de Lomé", items: [I.accueil, I.reception, I.stocks, as(I.transports, "Arrivages et lots"), I.enlevements, I.carte, as(I.contrats, "Contrats (lecture)")] },
  ],
  chauffeur: [
    { group: "Mes trajets", items: [I.accueil, I.trajets, I.frais, I.notifications] },
  ],
  comptable: [
    { group: "Comptabilité", items: [I.accueil, I.finances, I.commissions, I.charges, I.exports] },
    { group: "Consultation", items: [I.personnel, I.contrats, I.transports, I.stocks, as(I.fournisseurs, "Fournisseurs"), I.journal, as(I.parametres, "Paramètres (lecture)"), as(I.actions, "Actions à confirmer")] },
  ],
};

const b = (i: NavItem, label: string): NavItem => ({ ...i, label });
export const BOTTOM: Record<Role, NavItem[]> = {
  patron: [I.accueil, I.contrats, b(I.transports, "Transports"), b(I.actions, "À confirmer"), I.plus],
  admin: [I.accueil, I.utilisateurs, b(I.parametres, "Paramètres"), b(I.journal, "Journal"), I.plus],
  gestionnaire: [I.accueil, I.contrats, b(I.transports, "Transports"), b(I.actions, "Demandes"), I.plus],
  fournisseur: [I.accueil, b(I.contrats, "Mes contrats"), I.declarer, I.notifications, I.profil],
  magasinier: [I.accueil, b(I.reception, "Réception"), I.stocks, b(I.transports, "Arrivages"), I.plus],
  chauffeur: [I.accueil, b(I.trajets, "Trajets"), b(I.frais, "Frais"), I.notifications, I.profil],
  comptable: [I.accueil, b(I.finances, "Finances"), I.commissions, b(I.exports, "Exports"), I.plus],
};

/** Accès aux écrans par rôle (garde de route de l'AppShell). Les écrans absents sont ouverts à tous les connectés. */
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/besoins": ["patron", "admin", "gestionnaire", "fournisseur", "comptable"],
  "/contrats": ["patron", "admin", "gestionnaire", "fournisseur", "magasinier", "comptable"],
  "/enlevements": ["patron", "admin", "gestionnaire", "magasinier", "comptable", "chauffeur", "fournisseur"],
  "/trajets": ["chauffeur"],
  "/frais": ["chauffeur"],
  "/reception": ["patron", "admin", "gestionnaire", "magasinier"],
  "/stocks": ["patron", "admin", "gestionnaire", "magasinier", "comptable"],
  "/carte": ["patron", "admin", "gestionnaire", "magasinier", "comptable"],
  "/declarer": ["fournisseur"],
  "/releve": ["fournisseur"],
  "/finances": ["patron", "admin", "comptable"],
  "/commissions": ["patron", "admin", "comptable", "fournisseur"],
  "/charges": ["patron", "admin", "gestionnaire", "comptable"],
  "/exports": ["patron", "admin", "comptable"],
  "/actions": ["patron", "admin", "gestionnaire", "comptable"],
  "/fournisseurs": ["patron", "admin", "gestionnaire", "comptable"],
  "/utilisateurs": ["patron", "admin"],
  "/parametres": ["patron", "admin", "comptable"],
  "/droits": ["patron", "admin"],
  "/journal": ["patron", "admin", "comptable"],
  "/personnel": ["patron", "admin", "gestionnaire", "comptable"],
  "/consentements": ["patron", "admin"],
  "/suivi": ["patron", "gestionnaire", "comptable"],
};

export function routeAllowed(path: string, role: Role) {
  const key = Object.keys(ROUTE_ROLES).find((k) => path === k || path.startsWith(`${k}/`));
  return !key || ROUTE_ROLES[key]!.includes(role);
}
