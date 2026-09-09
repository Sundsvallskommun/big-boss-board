"use client";

import { useId } from "react";

import {
  CartesianGrid,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** En månadsstängning i sjukfrånvarodiagrammet (etiketten är redan formaterad, t.ex. "jul 26").
 *  Varje punkt är ett rullande 12-månadersvärde, inte månadens eget utfall. */
export interface SjukChartPunkt {
  period: string;
  total: number | null;
  kvinnor: number | null;
  man: number | null;
}

/** Färger i kommunens palett (samma tokens som tailwind.config).
 *
 *  **Färg betyder måluppfyllelse, inget annat.** Totalen ritas grön under målet och röd
 *  över det, och byter exakt vid mållinjen. Därför får könslinjerna inte bära kulör: det
 *  tidigare paret lila/grönt hade satt ett andra grönt i rutan, och legendens gröna prick
 *  hade betytt både "Män" och "under målet". De är i stället två gråtoner som skiljs åt av
 *  streckning, och vid hover av fylld kontra ihålig prick — former, inte färg, så
 *  uppdelningen överlever både färgblindhet och en svartvit utskrift.
 *
 *  Mållinjen är neutralt grå, till skillnad från HME-grafens gula. Här bär grönt och rött
 *  redan nivån, och ett tredje statusgult vid brytpunkten hade antytt en gul zon som inte
 *  finns i den tvåfärgade skalan. Linjen är en referens, inte ett utfall — den bär därför
 *  samma kromfärg som axeltexten och sin egen etikett "Mål".
 *
 *  Grönt/rött ensamt vore annars ett klassiskt färgblindhetsfel. Här är det redundant:
 *  samma sak sägs av punktens läge i förhållande till den streckade mållinjen och av
 *  talet som står utskrivet vid varje punkt. */
const C = {
  god: "#1E8A4E", // status-good — på eller under målet
  larm: "#D32F2F", // status-alert — över målet
  kvinnor: "#51515C", // dark-secondary, heldragen + fylld prick
  man: "#86868F", // ljusare grå, streckad + ihålig prick
  mal: "#51515C", // dark-secondary — mållinjen är kromdetalj, inte status
  grid: "#E5E5E5", // gray-200
  axis: "#51515C", // dark-secondary
  etikett: "#51515C", // dark-secondary — etiketter bär TEXTfärg, aldrig seriefärgen
  yta: "#FFFFFF", // background-content — ring runt punkter som överlappar
};

const fmt = (v: number) => v.toFixed(1).replace(".", ",");

type PrickProps = { cx?: number; cy?: number; index?: number };

/** Recharts färdigräknade ritläge, som det skickas till <Customized>. Vi rör bara de
 *  redan uträknade punktpositionerna — då slipper vi räkna om skalorna på egen hand. */
type RitlageProps = {
  formattedGraphicalItems?: {
    /** Line.getComposedData() returnerar bara {points, layout, offset} — dataKey finns
     *  INTE här, utan på det ursprungliga <Line>-elementet i `item`. */
    props?: { points?: { x?: number; y?: number; value?: number | null }[] };
    item?: { props?: { dataKey?: string } };
  }[];
  offset?: { top?: number; left?: number; width?: number; height?: number };
};

const ETIKETT_AVSTAND = 13; // minsta lodräta luft mellan två etiketter, px
const ETIKETT_LYFT = 10; // etikettens normalläge ovanför sin punkt, px
const ETIKETT_FALL = 16; // reservläget under punkten, px
const ETIKETT_BREDD = 28; // vågrätt utrymme en etikett behöver för att andas, px

/** Ordningen är prioritetsordning: totalen är samtalets huvudtal och får alltid sin
 *  etikett, könslinjerna bara när de klarar minsta avstånd till den. */
const ETIKETTSERIER = [
  { key: "total", farg: "#1F1F25", vikt: 600 }, // dark-primary (bläck) — textfärg
  { key: "kvinnor", farg: C.etikett, vikt: 500 },
  { key: "man", farg: C.etikett, vikt: 500 },
] as const;

/** Alla direktetiketter i ETT lager, så att serierna kan vägas mot varandra.
 *
 *  Varje månad ska gå att läsa av direkt: rutan används i ett uppföljningssamtal, ofta
 *  projicerad, där ingen hovrar med musen över en punkt. Priset är att tre serier kan
 *  ligga för tätt för tre tal — Överförmyndarkontoret har kvinnor 0,1 p.e. över totalen,
 *  vilket är tre pixlar. Recharts ritar varje series etiketter för sig och kan inte veta
 *  det, så layouten görs här i stället: totalen får alltid sitt tal, könslinjerna prövas
 *  först ovanför och sedan under sin punkt, och hoppas över om de ändå krockar. Det som
 *  utelämnas finns kvar i tooltip:en.
 *
 *  Etiketterna bär textfärg, aldrig seriefärgen — identiteten kommer från den färgade
 *  punkten bredvid talet. Konturen i sidans ytfärg håller talet läsbart där det hamnar
 *  ovanpå en linje eller en hjälplinje. */
function Direktetiketter({ formattedGraphicalItems, offset }: RitlageProps) {
  const serier = ETIKETTSERIER.map((s) => ({
    ...s,
    punkter:
      formattedGraphicalItems?.find((i) => i.item?.props?.dataKey === s.key)?.props?.points ?? [],
  }));
  const antal = Math.max(...serier.map((s) => s.punkter.length), 0);
  if (antal === 0) return <g />;

  // Glesa ut hellre än att låta talen gå in i varandra på en smal panel.
  const bredd = offset?.width ?? 0;
  const steg = bredd / Math.max(1, antal - 1) >= ETIKETT_BREDD ? 1 : 2;
  const topp = offset?.top ?? 0;

  const ut: React.ReactElement[] = [];
  for (let i = 0; i < antal; i++) {
    if (steg > 1 && i % steg !== 0 && i !== antal - 1) continue;
    const satta: number[] = [];
    // Alla seriers punkter för den här månaden — behövs för att kunna avgöra om en
    // etikett hamnar närmare någon annans linje än sin egen.
    const punkterHar = serier
      .map((serie) => serie.punkter[i])
      .filter((p): p is { x: number; y: number; value: number } =>
        p != null && p.x != null && p.y != null && typeof p.value === "number",
      );

    for (const serie of serier) {
      const punkt = serie.punkter[i];
      if (!punkt || punkt.x == null || punkt.y == null || typeof punkt.value !== "number") continue;
      const egenY = punkt.y;
      // Ovanför punkten är normalläget; under är reserven när det är trångt. Klamras mot
      // plottens överkant så att ett högt värde inte skjuter talet ur rutan.
      const lagen = [Math.max(egenY - ETIKETT_LYFT, topp + 10), egenY + ETIKETT_FALL];
      const valt = lagen.find(
        (y) =>
          // Inte ovanpå ett tal som redan står här.
          satta.every((s) => Math.abs(s - y) >= ETIKETT_AVSTAND) &&
          // Och inte närmare någon annan series linje än sin egen — ett tal som svävar
          // intill fel linje är värre än inget tal alls. Överförmyndarkontoret har
          // kvinnor 0,1 p.e. över totalen; där utelämnas könstalen och står kvar i tooltip:en.
          punkterHar.every((p) => p.y === egenY || Math.abs(y - p.y) >= Math.abs(y - egenY)),
      );
      if (valt == null) continue;
      satta.push(valt);
      ut.push(
        <text
          key={`${serie.key}-${i}`}
          x={punkt.x}
          y={valt}
          fill={serie.farg}
          fontSize={11}
          fontWeight={serie.vikt}
          textAnchor="middle"
          stroke={C.yta}
          strokeWidth={3}
          paintOrder="stroke"
        >
          {fmt(punkt.value)}
        </text>,
      );
    }
  }
  return <g>{ut}</g>;
}

/** Totalens punkter färgas av sitt eget värde, så en prick aldrig kan hamna på fel sida
 *  om mållinjen färgmässigt. Linjen mellan dem sköts av gradienten nedan. */
function totalPunkt(data: SjukChartPunkt[], mal: number) {
  return function Prick({ cx, cy, index }: PrickProps) {
    if (cx == null || cy == null || index == null) return <g />;
    const v = data[index]?.total;
    if (typeof v !== "number") return <g />;
    return <circle cx={cx} cy={cy} r={3} fill={v > mal ? C.larm : C.god} stroke={C.yta} strokeWidth={1.5} />;
  };
}

/** Färgar totalens linje efter var den går i förhållande till målet.
 *
 *  Två hårda stopp på samma offset ger ett skarpt skifte i stället för en toning, och
 *  eftersom gradienten läggs i ritytans egna pixelkoordinater (`userSpaceOnUse`) ligger
 *  skiftet exakt på mållinjen — även mitt i ett segment där kurvan korsar den. Ett
 *  alternativ hade varit att dela serien i två, men då måste korsningspunkterna räknas
 *  fram för hand och varje hål i serien hanteras två gånger. */
function malGradient(id: string, mal: number, ymax: number) {
  return function Gradient({ offset }: RitlageProps) {
    const topp = offset?.top ?? 0;
    const hojd = offset?.height ?? 0;
    if (!hojd) return <g />;
    // Andel av ritytans höjd, uppifrån räknat, där målet ligger.
    const brytning = Math.min(Math.max(1 - mal / ymax, 0), 1);
    return (
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={topp} x2={0} y2={topp + hojd}>
          <stop offset={brytning} stopColor={C.larm} />
          <stop offset={brytning} stopColor={C.god} />
        </linearGradient>
      </defs>
    );
  };
}

/** Egen legend. Totalens linje byter färg vid målet, så ett enda färgprov kan inte
 *  stå för den — och Recharts standardlegend skulle rita gradientens `url(...)` som
 *  ikon. Nycklarna visar därför både färgen och formen som skiljer serierna åt. */
function LegendInnehall() {
  const nycklar = [
    { text: "Totalt — under målet", farg: C.god, streckad: false, prick: "ingen" as const },
    { text: "Totalt — över målet", farg: C.larm, streckad: false, prick: "ingen" as const },
    { text: "Kvinnor", farg: C.kvinnor, streckad: false, prick: "ingen" as const },
    { text: "Män", farg: C.man, streckad: true, prick: "ingen" as const },
  ];
  return (
    <ul
      style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "4px 20px", padding: "8px 0 0", margin: 0, listStyle: "none",
        fontSize: 12, color: C.axis,
      }}
    >
      {nycklar.map((n) => (
        <li key={n.text} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width={20} height={10} aria-hidden="true">
            <line
              x1={0} y1={5} x2={20} y2={5}
              stroke={n.farg}
              strokeWidth={n.prick === "ingen" ? 2.5 : 2}
              strokeDasharray={n.streckad ? "5 3" : undefined}
            />
            {n.prick !== "ingen" && (
              <circle
                cx={10} cy={5} r={3.5}
                fill={n.prick === "fylld" ? n.farg : C.yta}
                stroke={n.prick === "fylld" ? C.yta : n.farg}
                strokeWidth={n.prick === "fylld" ? 1.5 : 2}
              />
            )}
          </svg>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

/** Sjukfrånvaro rullande 12 månader: total (bläcklinje) med kvinnors och mäns nivå. */
export function SjukfranvaroChart({ data, mal }: { data: SjukChartPunkt[]; mal: number }) {
  // Eget id per instans — två diagram på samma sida får aldrig dela gradient.
  const gradientId = useId().replace(/:/g, "") + "-sjuk-mal";
  if (data.length === 0) return null;

  const vals = data.flatMap((d) =>
    [d.total, d.kvinnor, d.man].filter((v): v is number => typeof v === "number"),
  );
  // Nollbaserad y-axel: sjukfrånvaro är en andel av arbetstiden, och en avkapad axel
  // skulle blåsa upp rörelser som i en R12-serie medvetet är små.
  //
  // Taket rundas upp till jämnt tal och stegen sätts explicit varannan procentenhet.
  // Recharts egna "nice ticks" gav annars 0–3–6–11: ojämna avstånd, och mållinjen råkade
  // hamna på en tick bara av en slump.
  const ymax = Math.max(10, Math.ceil(Math.max(...vals, mal) / 2) * 2);
  const ticks = Array.from({ length: ymax / 2 + 1 }, (_, i) => i * 2);
  const sista = data.length - 1;

  const forsta = data[0];
  const senaste = data[sista];
  const sammanfattning =
    `Total sjukfrånvaro rullande 12 månader, ${data.length} månadsstängningar från ` +
    `${forsta.period} till ${senaste.period}. ` +
    (typeof senaste.total === "number"
      ? `Senaste värdet ${fmt(senaste.total)} procent` +
        (typeof forsta.total === "number" ? `, mot ${fmt(forsta.total)} procent i början av serien` : "") +
        `. Målnivå ${fmt(mal)} procent — kurvan är grön under målet och röd över det.`
      : "");

  return (
    <div className="h-[360px] w-full" role="img" aria-label={sammanfattning}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 40, bottom: 4, left: 0 }}>
          <Customized component={malGradient(gradientId, mal, ymax)} />
          <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="period"
            tick={{ fill: C.axis, fontSize: 12 }}
            axisLine={{ stroke: C.grid }}
            tickLine={false}
            // Första och sista månaden ska alltid stå kvar — det är dem serien läses mellan.
            // Däremellan får Recharts glesa ut när panelen är för smal för tolv etiketter.
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis
            domain={[0, ymax]}
            ticks={ticks}
            tick={{ fill: C.axis, fontSize: 12 }}
            tickFormatter={(v) => fmt(v)}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            formatter={(v: number, name) => [`${fmt(v)} %`, name]}
            labelFormatter={(l) => `${l} · rullande 12 månader`}
            contentStyle={{ borderRadius: 12, border: `1px solid ${C.grid}`, fontSize: 13 }}
          />
          <Legend content={<LegendInnehall />} />

          <ReferenceLine
            y={mal}
            stroke={C.mal}
            strokeDasharray="6 6"
            label={{ value: "Mål", position: "right", fill: C.axis, fontSize: 12 }}
          />

          <Line
            type="monotone"
            dataKey="kvinnor"
            name="Kvinnor %"
            stroke={C.kvinnor}
            strokeWidth={2}
            // Ingen ritad prick — kvinnor och män framträder först vid hover, som
            // activeDot. Fylld prick, samma formspråk som legendens tidigare nyckel.
            dot={false}
            activeDot={{ r: 5, fill: C.kvinnor, stroke: C.yta, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="man"
            name="Män %"
            stroke={C.man}
            strokeWidth={2}
            strokeDasharray="5 3"
            // Ihålig prick vid hover, så kvinnor och män går att skilja åt även när
            // båda tänds samtidigt och tonerna ligger nära varandra.
            dot={false}
            activeDot={{ r: 5, fill: C.yta, stroke: C.man, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Totalt %"
            stroke={`url(#${gradientId})`}
            strokeWidth={2.5}
            dot={totalPunkt(data, mal)}
            activeDot={{ r: 6, stroke: C.yta, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Customized component={Direktetiketter} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
