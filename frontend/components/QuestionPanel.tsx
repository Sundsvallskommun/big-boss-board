import { MessagesSquare } from "lucide-react";
import type { DialogueArea } from "@/lib/api";
import { areaIcon } from "./icons";

/** Dialogpanel för nyckeltal UTAN mätdata (BYGGPLAN §17): visar områdets namn och
 *  ett par frågeställningar att ha dialog kring — ingen graf, mätarbar eller siffra. */
export function QuestionPanel({
  item,
  index,
  total,
}: {
  item: DialogueArea;
  index: number;
  total: number;
}) {
  const { area } = item;
  const AreaIcon = areaIcon(area.ikon);
  const fragor = [...area.questions].sort((a, b) => a.ordning - b.ordning);

  return (
    <section className="reveal divide-y divide-hairline overflow-hidden rounded-12 border border-hairline bg-background-content">
      {/* Panelhuvud */}
      <div className="bg-vattjom-background-100 p-24 md:p-28">
        <div className="flex items-start gap-14">
          <span className="grid h-48 w-48 shrink-0 place-items-center rounded-12 border border-hairline bg-background-content text-vattjom-text-primary">
            <AreaIcon size={24} strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <div className="eyebrow-sm mb-4">
              Område {index + 1} av {total}
            </div>
            <h2 className="font-header text-h4 font-bold leading-tight tracking-tight">
              {area.namn}
            </h2>
            <p className="mt-4 max-w-[576px] text-small leading-relaxed text-dark-secondary">
              Det här området har inget mätvärde ännu — det följs upp genom dialog utifrån
              frågorna nedan.
            </p>
          </div>
        </div>
      </div>

      {/* Frågeställningar */}
      <div className="p-24 md:p-28">
        <h3 className="eyebrow mb-16 flex items-center gap-8">
          <MessagesSquare size={14} aria-hidden="true" />
          Frågor att ha dialog kring
        </h3>
        {fragor.length > 0 ? (
          <ol className="flex flex-col gap-12">
            {fragor.map((q, i) => (
              <li
                key={q.id}
                className="flex items-start gap-14 rounded-12 border border-hairline bg-background-content p-16"
              >
                <span className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-vattjom-background-100 text-small font-semibold text-vattjom-text-primary">
                  {i + 1}
                </span>
                <p className="text-base leading-relaxed text-dark-primary">{q.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-small leading-relaxed text-dark-secondary">
            Inga frågeställningar tillagda ännu.
          </p>
        )}
      </div>
    </section>
  );
}
