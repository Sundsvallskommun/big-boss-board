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
  const harOkandMetod = kontroll?.underlag.some((fil) => fil.status === "matmetod_okand");
  const harOtolkbartUnderlag = kontroll?.underlag.some((fil) => fil.status === "ogiltigt_underlag");
  if (!saknas.length && !kontroll?.underlag.length) return null;

  return (
    <section aria-label="Underlag för sjukfrånvaro" className="mb-16 rounded-12 border border-hairline bg-background-content p-24">
      <h2 className="font-header text-large font-bold">
        {kontroll?.underlag.length ? "Filer som inte används i nyckeltalet" : "Uppgifter saknas i underlaget"}
      </h2>
      {saknas.length > 0 && (
        <p className="mt-8 text-small text-dark-secondary">
          Ofullständigt R12-underlag för {details?.typ === "sjukfranvaro" ? details.period : ""}.
          {" "}Saknas: {saknas.join(", ")}. Tillgängliga värden visas; beräkningar som behöver saknade uppgifter uteblir.
        </p>
      )}
      {(kontroll?.underlag.length ?? 0) > 0 && (
        <p className="mt-8 text-small text-dark-secondary">
          Filerna nedan är sparade, men deras värden ingår inte i R12-serien, trenden eller statusbedömningen.
          {" "}R12 betyder rullande tolv månader fram till respektive rapportperiod.
          {details?.typ === "sjukfranvaro" && details.matmetod === "rullande12" && item.measurement?.value_num != null && (
            <> Sjukfrånvarovärdet i kortet ovan bygger på det importerade R12-underlaget.</>
          )}
        </p>
      )}
      {harOkandMetod && (
        <div className="mt-16 rounded-8 bg-vattjom-background-100 p-16 text-small">
          <h3 className="font-semibold">Varför kan filerna inte användas?</h3>
          <p className="mt-8">
            Filerna med obekräftad mätmetod saknar personalmått, till exempel antal anställda,
            som appen använder för att känna igen det nyare exportformatet. Därför kan appen
            inte avgöra om sjukfrånvaron är beräknad som rullande tolv månader eller på något annat sätt.
            Procentsiffrorna kan vara riktiga, men vi vet inte om de är jämförbara med R12-värdena.
          </p>
          <p className="mt-12 font-semibold">Fråga den som tar fram personalrapporten:</p>
          <blockquote className="mt-8 border-l-2 border-vattjom-surface-primary pl-12">
            Gäller sjukfrånvaron i filerna nedan rullande tolv månader, eller är den beräknad
            för en annan period? Om den ska användas som R12, kan ni leverera ett nytt uttag
            enligt det aktuella exportformatet, inklusive personalmåtten?
          </blockquote>
          <p className="mt-8 text-dark-secondary">
            Underlag som beräknats på ett annat sätt behålls separat. Vyn visar sparade uppgifter;
            rättning görs av den som ansvarar för rapporten.
          </p>
        </div>
      )}
      {harOtolkbartUnderlag && (
        <div className="mt-16 rounded-8 bg-vattjom-background-100 p-16 text-small">
          <h3 className="font-semibold">Vissa filer kunde inte läsas som giltigt underlag</h3>
          <p className="mt-8">
            Filens format, datum eller mätvärden klarade inte kontrollen. Originalet är bevarat,
            men inga värden från filen används. Be systemförvaltningen granska originalfilen
            tillsammans med den som tar fram rapporten och ordna ett korrigerat uttag.
          </p>
        </div>
      )}
      {kontroll?.underlag.map((fil) => (
        <details key={fil.id} className="mt-12 border-t border-hairline pt-12">
          <summary className="cursor-pointer break-words rounded-4 text-small font-semibold focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {fil.filnamn} — {fil.status === "matmetod_okand" ? "Obekräftad mätmetod · visa sparade värden" : "Kunde inte tolkas · visa information"}
          </summary>
          {fil.enhet ? (
            <>
              <p className="mt-8 text-small text-dark-secondary">
                Så står det i den sparade filen. Beräkningssättet är ännu inte bekräftat.
                {" "}”Saknas” betyder att uppgiften inte finns för rapportperioden.
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
