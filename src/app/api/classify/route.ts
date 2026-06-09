import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ClassifyRequest, ClassifyResponse } from '@/types'

const MODEL = 'gpt-4o-mini' as const
const MAX_TOKENS = 300

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = ['zamówienie', 'pytanie', 'reklamacja', 'spam'] as const
const PRIORITIES = ['high', 'medium', 'low'] as const

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'message_classification',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: { type: 'string', enum: CATEGORIES },
        priority: { type: 'string', enum: PRIORITIES },
        draft_reply: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['category', 'priority', 'draft_reply', 'confidence'],
    },
  },
} as const

const buildSystemPrompt = (company: string): string =>
  [
    'Jesteś asystentem obsługi klienta, który klasyfikuje przychodzące wiadomości i przygotowuje szkice odpowiedzi.',
    'Przeanalizuj wiadomość i zwróć wynik zgodny z podanym schematem JSON.',
    `Pole "category" to jedna z wartości: ${CATEGORIES.join(', ')}.`,
    `Pole "priority" to jedna z wartości: ${PRIORITIES.join(', ')}.`,
    'Pole "confidence" to liczba od 0.0 do 1.0 wyrażająca pewność klasyfikacji.',
    'Pole "draft_reply" musi być napisane w języku polskim.',
    `Dostosuj ton odpowiedzi "draft_reply" do profilu firmy: ${company}.`,
  ].join(' ')

const isClassifyResponse = (value: unknown): value is ClassifyResponse => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.category === 'string' &&
    (CATEGORIES as readonly string[]).includes(candidate.category) &&
    typeof candidate.priority === 'string' &&
    (PRIORITIES as readonly string[]).includes(candidate.priority) &&
    typeof candidate.draft_reply === 'string' &&
    typeof candidate.confidence === 'number' &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1
  )
}

/**
 * Handles `POST /api/classify`.
 *
 * Classifies an inbound customer message and produces a ready-to-send draft
 * reply using the OpenAI `gpt-4o-mini` model. Structured Outputs
 * (`response_format: { type: 'json_schema', ... }`) guarantees that the model
 * returns a payload matching the {@link ClassifyResponse} contract. The system
 * prompt instructs the model to write `draft_reply` in Polish, adapting its
 * tone to the supplied company profile.
 *
 * @param req - Incoming request whose JSON body must satisfy {@link ClassifyRequest}.
 * @returns A JSON response:
 *  - `200` with a {@link ClassifyResponse} payload on success.
 *  - `400` when `message` or `company` is missing or empty.
 *  - `500` when the OpenAI request fails or returns an invalid payload.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<ClassifyResponse | { error: string }>> {
  let body: ClassifyRequest

  try {
    body = (await req.json()) as ClassifyRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = body?.message?.trim()
  const company = body?.company?.trim()

  if (!message || !company) {
    return NextResponse.json(
      { error: 'Both "message" and "company" are required and must be non-empty.' },
      { status: 400 },
    )
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: 'system', content: buildSystemPrompt(company) },
        { role: 'user', content: message },
      ],
    })

    const content = completion.choices[0]?.message?.content

    if (!content) {
      return NextResponse.json({ error: 'Empty response from model.' }, { status: 500 })
    }

    const parsed: unknown = JSON.parse(content)

    if (!isClassifyResponse(parsed)) {
      return NextResponse.json({ error: 'Malformed response from model.' }, { status: 500 })
    }

    return NextResponse.json(parsed, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to classify the message.' }, { status: 500 })
  }
}
