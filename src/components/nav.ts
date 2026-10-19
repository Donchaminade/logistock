import {
  Bell, ClipboardCheck, FileText, Handshake, History, LayoutDashboard, MoreHorizontal, PackagePlus, ShieldCheck,
  Truck, User as UserIcon, Users, Wallet, Warehouse, type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "pending" | "notifications";
}

export const SIDEBAR: Record<Role, { group: string; items: NavItem[] }[]> = {
  patron: [
    { group: "Pilotage", items: [
      { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
      { href: "/besoins/", label: "Besoins et propositions", icon: Handshake },
      { href: "/contrats/", label: "Contrats", icon: FileText },
      { href: "/transports/", label: "Transports et lots", icon: Truck },
      { href: "/stocks/", label: "Stocks déclarés", icon: Warehouse },
      { href: "/finances/", label: "Paiements et dettes", icon: Wallet },
    ] },
    { group: "Contrôle", items: [
      { href: "/actions/", label: "Actions à confirmer", icon: ClipboardCheck, badge: "pending" },
      { href: "/fournisseurs/", label: "Comptes", icon: Users },
      { href: "/droits/", label: "Rôles et droits", icon: ShieldCheck },
      { href: "/journal/", label: "Journal d'audit", icon: History },
    ] },
  ],
  gestionnaire: [
    { group: "Terrain", items: [
      { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
      { href: "/contrats/", label: "Contrats", icon: FileText },
      { href: "/transports/", label: "Transports et lots", icon: Truck },
      { href: "/stocks/", label: "Stocks déclarés", icon: Warehouse },
      { href: "/besoins/", label: "Besoins", icon: Handshake },
    ] },
    { group: "Suivi", items: [
      { href: "/actions/", label: "Mes demandes", icon: ClipboardCheck, badge: "pending" },
      { href: "/fournisseurs/", label: "Fournisseurs", icon: Users },
    ] },
  ],
  fournisseur: [
    { group: "Mon espace", items: [
      { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
      { href: "/contrats/", label: "Mes contrats", icon: FileText },
      { href: "/declarer/", label: "Déclarer", icon: PackagePlus },
      { href: "/besoins/", label: "Besoins du patron", icon: Handshake },
    ] },
  ],
};

export const BOTTOM: Record<Role, NavItem[]> = {
  patron: [
    { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
    { href: "/contrats/", label: "Contrats", icon: FileText },
    { href: "/transports/", label: "Transports", icon: Truck },
    { href: "/actions/", label: "À confirmer", icon: ClipboardCheck, badge: "pending" },
    { href: "/plus/", label: "Plus", icon: MoreHorizontal },
  ],
  gestionnaire: [
    { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
    { href: "/contrats/", label: "Contrats", icon: FileText },
    { href: "/transports/", label: "Transports", icon: Truck },
    { href: "/actions/", label: "Demandes", icon: ClipboardCheck, badge: "pending" },
    { href: "/plus/", label: "Plus", icon: MoreHorizontal },
  ],
  fournisseur: [
    { href: "/accueil/", label: "Accueil", icon: LayoutDashboard },
    { href: "/contrats/", label: "Mes contrats", icon: FileText },
    { href: "/declarer/", label: "Déclarer", icon: PackagePlus },
    { href: "/notifications/", label: "Notifications", icon: Bell, badge: "notifications" },
    { href: "/profil/", label: "Profil", icon: UserIcon },
  ],
};
