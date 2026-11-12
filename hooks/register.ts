import type { Register } from 'claude-code'

// The Python interpreter on PATH; `python3` systems can override it with `/voicenotes python <cmd>`.
const DEFAULT_PY = 'python'

// $.process.spawn is a stream that starts the child on its first pull and kills it when the loop ends,
// so the loop is drained in the background; the hook itself returns at once.
function speak($: any, voice: string, text: string): void {
  void (async () => {
    try {
      // The helper sits next to plugin.json; $.plugin.root is that folder, absolute.
      const speakPy = `${$.plugin.root}/speak.py`
      const stored = await $.store.get('python')
      const py = typeof stored === 'string' && stored ? stored : DEFAULT_PY
      for await (const _ of $.process.spawn({ argv: [py, speakPy, voice], input: text })) {
        // speak.py writes nothing; draining keeps the child alive until it exits
      }
    } catch (err) {
      $.ui.log(`speak.py failed: ${String(err)}`, { to: 'debug' })
    }
  })()
}

const VOICES: Record<string, string> = {
  svetlana: 'ru-RU-SvetlanaNeural',
  dmitry: 'ru-RU-DmitryNeural',
}

// Haiku decides whether an answer holds anything worth hearing, and if so says it in one short sentence.
const PICKER = `Ответ ассистента. Озвучь только: итог законченной задачи, вопрос или решение от пользователя, блокирующую ошибку.
Иначе ответь: -
Формат: одно разговорное предложение по-русски, до 15 слов, от первого лица. Без кода, путей, ссылок, markdown.`

// Answers shorter than this with no question mark are skipped without a model call.
const MIN_CHARS = 150
// Only the tail goes to Haiku: the outcome and the question sit at the end of an answer.
const TAIL_CHARS = 2500

async function voiceOf($: { store: { get: (k: string) => Promise<unknown> } }): Promise<string> {
  const v = await $.store.get('voice')
  return typeof v === 'string' && VOICES[v] ? VOICES[v] : VOICES.svetlana
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'voicenotes',
      description: 'Озвучка ключевых моментов: on | off | svetlana | dmitry | test | python <cmd>',
    })
    return next(e)
  })

  on('command.run', { command: 'voicenotes' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      return { text: arg === 'on' ? 'Озвучка включена.' : 'Озвучка выключена.' }
    }
    if (VOICES[arg]) {
      await $.store.set('voice', arg)
      return { text: `Голос: ${arg}.` }
    }
    if (arg.startsWith('python ')) {
      const cmd = e.args.trim().slice('python '.length).trim()
      await $.store.set('python', cmd)
      return { text: `Python: ${cmd}.` }
    }
    if (arg === 'test') {
      speak($, await voiceOf($), 'Проверка голоса. Всё работает.')
      return { text: '🔊 Проверка голоса.' }
    }
    const isOn = (await $.store.get('enabled')) !== false
    return {
      text: `Озвучка ${isOn ? 'включена' : 'выключена'}, голос ${(await $.store.get('voice')) ?? 'svetlana'}. Аргументы: on | off | svetlana | dmitry | test | python <cmd>`,
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Only the main loop's finished answers; subagents, interruptions and errors stay silent.
    if (e.agentId || e.reason !== 'answer' || !e.answer.trim()) return result
    if ((await $.store.get('enabled')) === false) return result
    const answer = e.answer.trim()
    if (answer.length < MIN_CHARS && !answer.includes('?')) return result

    const pick = await $.model.complete({
      model: 'haiku',
      system: PICKER,
      prompt: answer.slice(-TAIL_CHARS),
      maxTokens: 60,
    })
    if (!pick.isAnswered) return result
    const say = pick.text.trim()
    if (!say || say === '-' || say.length < 4) return result

    // Voice only: nothing is added beneath the answer.
    speak($, await voiceOf($), say)
    return result
  })
}
