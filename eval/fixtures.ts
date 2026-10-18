/**
 * Hand-labelled scripts for comparing parsers. Each fixture is a script as a
 * user might paste or upload it, plus the entries a correct parse produces
 * (what someone would end up with after fixing it in the editor).
 *
 * Add real scripts here (trimmed to a few pages) as they turn up, especially
 * ones the heuristic parser gets wrong: the corrected script is the answer.
 */

export interface ExpectedEntry {
  type: 'line' | 'direction' | 'scene';
  speakers?: string[];
  text: string;
}

export interface Fixture {
  name: string;
  source: string;
  expected: ExpectedEntry[];
}

const line = (speakers: string | string[], text: string): ExpectedEntry => ({
  type: 'line',
  speakers: Array.isArray(speakers) ? speakers : [speakers],
  text
});
const direction = (text: string): ExpectedEntry => ({ type: 'direction', text });
const scene = (text: string): ExpectedEntry => ({ type: 'scene', text });

export const fixtures: Fixture[] = [
  {
    name: 'English, clean',
    source: `ACT 1
ROMEO: But soft, what light through yonder window breaks?
JULIET: Ay me.
(Romeo steps forward)
ROMEO: She speaks.
ACT 2
JULIET: Goodnight, goodnight.`,
    expected: [
      scene('ACT 1'),
      line('ROMEO', 'But soft, what light through yonder window breaks?'),
      line('JULIET', 'Ay me.'),
      direction('Romeo steps forward'),
      line('ROMEO', 'She speaks.'),
      scene('ACT 2'),
      line('JULIET', 'Goodnight, goodnight.')
    ]
  },
  {
    name: 'Hebrew, clean',
    source: `תמונה א'
אלון: שלום לכולם.
אורן: שלום אלון.
(הם מתיישבים)
אלון ואורן: יאללה, מתחילים.`,
    expected: [
      scene("תמונה א'"),
      line('אלון', 'שלום לכולם.'),
      line('אורן', 'שלום אלון.'),
      direction('הם מתיישבים'),
      line(['אלון', 'אורן'], 'יאללה, מתחילים.')
    ]
  },
  {
    name: 'English, messy (title page, cast list, page numbers, aliases, unbracketed directions)',
    source: `THE GARDEN PARTY
A Comedy in One Act

CAST OF CHARACTERS
MARGARET, the hostess
TOM, her brother
DR. PATEL, a guest

SCENE 1

A garden. Afternoon.

MARGARET
Tom, you're late again.
TOM
I brought flowers. Doesn't that count?
MARGARET: It counts for something.
She takes the flowers and sniffs them.
Tom: Margaret, they're from your own garden.
MARGARET: (laughing) Of course they are.

- 2 -

DR. PATEL: Am I interrupting?
MARGARET and TOM: Not at all!
DR. PATEL: Good. Because I have news, and it can't wait.
It's about the house.
The whole house.
MARG. The house? What about it?`,
    expected: [
      scene('SCENE 1'),
      direction('A garden. Afternoon.'),
      line('MARGARET', "Tom, you're late again."),
      line('TOM', "I brought flowers. Doesn't that count?"),
      line('MARGARET', 'It counts for something.'),
      direction('She takes the flowers and sniffs them.'),
      line('TOM', "Margaret, they're from your own garden."),
      line('MARGARET', '(laughing) Of course they are.'),
      line('DR. PATEL', 'Am I interrupting?'),
      line(['MARGARET', 'TOM'], 'Not at all!'),
      line('DR. PATEL', "Good. Because I have news, and it can't wait. It's about the house. The whole house."),
      line('MARGARET', 'The house? What about it?')
    ]
  },
  {
    name: 'Hebrew, messy (cast list, cue on its own line, page footer, multi-line speech)',
    source: `הבית ברחוב הרצל
מחזה מאת דנה כהן

דמויות:
רינה, האם
יואב, הבן
סבתא

תמונה 1

מטבח. בוקר.

רינה: יואב, קום כבר! מאחרים לבית הספר.
יואב
עוד חמש דקות, אמא.
רינה: אמרת את זה לפני חצי שעה.
(סבתא נכנסת עם סל)
סבתא: מה הצעקות האלה מהבוקר?
רינה וסבתא: יואב!
יואב: טוב, טוב, אני קם.
הוא יוצא מהחדר בעצלתיים.

עמוד 2

תמונה 2

סבתא: רינה, צריך לדבר.
זה חשוב.
רינה. על מה?`,
    expected: [
      scene('תמונה 1'),
      direction('מטבח. בוקר.'),
      line('רינה', 'יואב, קום כבר! מאחרים לבית הספר.'),
      line('יואב', 'עוד חמש דקות, אמא.'),
      line('רינה', 'אמרת את זה לפני חצי שעה.'),
      direction('סבתא נכנסת עם סל'),
      line('סבתא', 'מה הצעקות האלה מהבוקר?'),
      line(['רינה', 'סבתא'], 'יואב!'),
      line('יואב', 'טוב, טוב, אני קם.'),
      direction('הוא יוצא מהחדר בעצלתיים.'),
      scene('תמונה 2'),
      line('סבתא', 'רינה, צריך לדבר. זה חשוב.'),
      line('רינה', 'על מה?')
    ]
  }
];
