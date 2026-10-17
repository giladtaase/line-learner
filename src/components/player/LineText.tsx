/** Renders a dialogue line with any inline (...)/[...] stage directions shown
 *  in a muted italic style, making clear they're acting notes, not words to
 *  actually speak (and thus not part of what the recording grader checks). */
export default function LineText({ text }: { text: string }) {
  const parts = text.split(/([(\[][^)\]]*[)\]])/g).filter((p) => p.length > 0);
  return (
    <>
      {parts.map((part, i) =>
        /^[(\[]/.test(part) ? (
          <span key={i} className="italic text-slate-400">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
