"use client";
import { TripList } from "@/components/driver";
import { PageHeader } from "@/components/ui";

export default function Trajets() {
  return (
    <>
      <PageHeader eyebrow="Chauffeur" title="Mes trajets" sub="Chargements, étapes et arrivée à Lomé. Les confirmations fonctionnent sans réseau et se synchronisent ensuite." />
      <TripList />
    </>
  );
}
