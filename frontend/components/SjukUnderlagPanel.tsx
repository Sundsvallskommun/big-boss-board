import type { DialogueArea } from "@/lib/api";
import { sjukSaknadeUppgifter } from "@/lib/sjukfranvaro";

const procent = (value: number | null | undefined) =>
  value == null ? "Saknas" : `${value.toLocaleString("sv-SE")} %`;

/** Osäkra original hålls utanför KPI-kortet, även när det ännu saknas R12-mätning. */
export function SjukUnderlagPanel({ item }: { item: DialogueArea }) {
  if (item.area.key !== "sjukfranvaro") return null;
  const details = item.measurement?.details;
  const saknas = details?.typ === "sjukfranvaro" && details.matmetod === "rullande12"
    ? sjukSaknadeUppgifter(details, item.measurement?.value_num) : [];
  const kontroll = item.sjuk_kontroll;
  if (!saknas.length && !kontroll?.underlag.length) return null;

  return (
    <section aria-label="Underlag för sjukfrånvaro" className="mb-16 rounded-12 border border-hairline bg-background-content p-24">
      <h2 className="font-header text-large font-bold">Underlag att kontrollera</h2>
      {saknas.length > 0 && (
        <p className="mt-8 text-small text-dark-secondary">
          Ofullständigt R12-underlag för {details?.typ === "sjukfranvaro" ? details.period : ""}.
          {" "}Saknas: {saknas.join(", ")}. Tillgängliga värden visas; beräkningar som behöver saknade uppgifter uteblir.
        </p>
      )}
      {(kontroll?.underlag.length ?? 0) > 0 && (
        <p className="mt-8 text-small text-dark-secondary">
          Följande filer har sparats separat för kontroll. Deras värden ingår inte i R12-serien, trenden eller statusbedömningen.
        </p>
      )}
      {kontroll?.underlag.map((fil) => (
        <details key={fil.id} className="mt-12 border-t border-hairline pt-12">
          <summary className="cursor-pointer break-words rounded-4 text-small font-semibold focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {fil.filnamn} — {fil.status === "matmetod_okand" ? "Mätmetod behöver bekräftas" : "Underlaget kunde inte tolkas"}
          </summary>
          {fil.enhet ? (
            <>
              <p className="mt-8 text-small text-dark-secondary">
                Rapporterade värden med obekräftad mätmetod. Tomma uppgifter betyder att underlag saknas.
              </p>
              <div className="mt-8 overflow-x-auto">
                <table className="w-full text-left text-small">
                  <caption className="sr-only">Rapporterad sjukfrånvaro med obekräftad mätmetod</caption>
                  <thead><tr>{["Period", "Totalt", "Kvinnor", "Män"].map((text) => <th scope="col" key={text} className="p-8">{text}</th>)}</tr></thead>
                  <tbody>{fil.enhet.serie.map((punkt) => (
                    <tr key={punkt.period} className="border-t border-hairline">
                      <th scope="row" className="p-8 font-normal">{punkt.period}</th>
                      <td className="p-8">{procent(punkt.total)}</td>
                      <td className="p-8">{procent(punkt.kvinnor)}</td>
                      <td className="p-8">{procent(punkt.man)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="mt-8 text-small text-dark-secondary">
                Senaste perioden ({fil.enhet.period}): långtidsandel {procent(fil.enhet.langtidsandel)},
                {" "}antal anställda {fil.enhet.anstallda?.toLocaleString("sv-SE") ?? "saknas"}.
              </p>
            </>
          ) : (
            <p className="mt-8 text-small text-dark-secondary">
              Originalet är bevarat. Filens format eller värden behöver kontrolleras innan uppgifterna kan användas.
            </p>
          )}
        </details>
      ))}
      {kontroll?.fler_finns && <p className="mt-12 text-small">De 50 senaste underlagen visas. Fler finns bevarade och kan granskas av systemförvaltningen.</p>}
    </section>
  );
}
