/**
 * analyzeDocument.js
 *
 * Calls the Claude claude-opus-4-5 vision API to parse a document image and return
 * a structured doc object matching the Claro schema.
 *
 * Environment variable required:
 *   VITE_ANTHROPIC_API_KEY — your Anthropic API key
 *
 * Browser note: the 'anthropic-dangerous-direct-browser-access' header is required
 * to allow direct browser-to-API calls (bypasses CORS restriction).
 */

const MODEL = 'claude-opus-4-5'
const API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are a document analysis assistant for Claro, an app that helps low-English-proficiency immigrants understand bureaucratic documents.

Analyze the provided document image and return a JSON object with this exact structure:
{
  "category": "<utility|medical|school|legal|government|housing|insurance>",
  "icon": "<material_symbol_name>",
  "title": { "en": "...", "es": "..." },
  "issuer": "...",
  "urgency": "<act-now|act-soon|review>",
  "deadlineLabel": { "en": "...", "es": "..." },
  "daysLeft": <number or null>,
  "summary": {
    "en": "2-3 plain-English sentences explaining what this document means for the recipient. Be direct: 'You need to...' or 'Your X will...'",
    "es": "Same summary in Spanish"
  },
  "steps": [
    {
      "id": 1,
      "done": false,
      "title": { "en": "Short action title", "es": "..." },
      "detail": { "en": "One sentence of specific guidance", "es": "..." },
      "phone": "<phone number string or null>"
    }
  ],
  "hiddenPaths": [
    { "en": "A right or option the recipient may not know about", "es": "..." }
  ],
  "keyInfo": [
    { "en": "Account/case number: ...", "es": "..." },
    { "en": "Amount due: ...", "es": "..." }
  ]
}

Rules:
- steps: 2-4 concrete actions the person must take, ordered by urgency
- hiddenPaths: 2-3 hidden rights, assistance programs, or options (things bureaucratic letters omit)
- keyInfo: extract all reference numbers, amounts, dates, phone numbers from the document
- daysLeft: calculate from today's date if a deadline is visible, otherwise null
- urgency: "act-now" if deadline ≤ 14 days or immediate action needed, "act-soon" if 15-60 days, "review" otherwise
- icon: choose the most appropriate Material Symbols name (e.g. "bolt" for utilities, "gavel" for legal, "health_and_safety" for medical, "school" for school, "home" for housing, "policy" for insurance, "account_balance" for government)
- If the image is unreadable, blurry, or not a document, return: {"error": "unreadable"}
- Return ONLY the JSON object, no markdown, no explanation.`

/**
 * Resize a dataURL image to at most maxDim px on the longest side,
 * returning a new JPEG dataURL. Keeps aspect ratio.
 */
function resizeImage(dataUrl, maxDim = 1568) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      const scale = Math.min(1, maxDim / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = dataUrl
  })
}

/**
 * analyzeDocument
 *
 * @param {string} dataUrl      - base64 data URL of the captured image (image/jpeg or image/png)
 * @param {object|null} existingDoc - pass the current doc when scanning page 2+ of a multi-page document
 * @returns {Promise<object>}   - structured doc object (without id/done fields — caller assigns those)
 * @throws {Error}              - 'MISSING_API_KEY' | 'UNREADABLE' | network/API errors
 */
export async function analyzeDocument(dataUrl, existingDoc = null) {
  const apiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim()
  if (!apiKey || apiKey.includes('YOUR_KEY_HERE')) {
    throw new Error('MISSING_API_KEY')
  }

  // Resize before sending
  const resized = await resizeImage(dataUrl, 1568)

  // Strip the data URL prefix to get pure base64
  const base64 = resized.split(',')[1]
  const mediaType = resized.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

  // Build the user message
  const userParts = []

  if (existingDoc) {
    userParts.push({
      type: 'text',
      text: `This is page ${(existingDoc._pageCount ?? 1) + 1} of a multi-page document. Here is the analysis of previous pages so far:\n\n${JSON.stringify(existingDoc, null, 2)}\n\nAnalyze the new page below and return an UPDATED version of the JSON that incorporates any new information, additional steps, new key info, or new hidden paths found on this page. Preserve all existing data unless the new page contradicts it.`,
    })
  } else {
    userParts.push({
      type: 'text',
      text: 'Please analyze this document image and return the structured JSON.',
    })
  }

  userParts.push({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  })

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userParts }],
    }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText)
    throw new Error(`API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  // Extract JSON — strip markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`JSON parse error. Raw response: ${text.slice(0, 200)}`)
  }

  if (parsed.error === 'unreadable') {
    throw new Error('UNREADABLE')
  }

  // Normalize steps to ensure required fields
  if (Array.isArray(parsed.steps)) {
    parsed.steps = parsed.steps.map((s, i) => ({
      id:     s.id ?? i + 1,
      done:   false,
      title:  s.title  ?? { en: '', es: '' },
      detail: s.detail ?? { en: '', es: '' },
      phone:  s.phone  ?? null,
    }))
  } else {
    parsed.steps = []
  }

  if (!Array.isArray(parsed.hiddenPaths)) parsed.hiddenPaths = []
  if (!Array.isArray(parsed.keyInfo))     parsed.keyInfo     = []

  return parsed
}
