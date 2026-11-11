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

// Haiku decides whether an answer holds anything worth hearing, and if so says it in one or two lines.
const PICKER = `Тебе дают ответ ИИ-ассистента пользователю. Реши, есть ли в нём то, что пользователь должен услышать:
итог сделанной работы, ошибка или проблема, вопрос к пользователю, нужное от него решение или действие, важное предупреждение.
Если ничего такого нет (промежуточный, проходной или очень короткий ответ) — ответь ровно одним символом: -
Если есть — 1–2 коротких разговорных предложения по-русски, не больше 30 слов, только самое важное.
Без кода, путей к файлам, ссылок, команд, markdown и эмодзи. Не пересказывай всё. Говори от первого лица ассистента.`

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

    const pick = await $.model.complete({
      model: 'haiku',
      system: PICKER,
      prompt: e.answer.slice(-6000),
      maxTokens: 200,
    })
    if (!pick.isAnswered) return result
    const say = pick.text.trim()
    if (!say || say === '-' || say.length < 4) return result

    speak($, await voiceOf($), say)
    return { ...result, text: `🔊 ${say}` }
  })
}
