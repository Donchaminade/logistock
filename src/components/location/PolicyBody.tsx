import { LOCATION_POLICY, LOCATION_POLICY_VERSION } from "@/lib/locationPolicy";

export function PolicyBody() {
  return (
    <div className="space-y-5 text-[14px] leading-relaxed text-ink">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted">Version {LOCATION_POLICY_VERSION}</p>
      {LOCATION_POLICY.map((s) => (
        <section key={s.title}>
          <h2 className="text-[15px] font-semibold">{s.title}</h2>
          {s.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="mt-2 text-muted">{p}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
