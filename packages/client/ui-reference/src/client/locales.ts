/** `reference` dictionaries for the unified `@` source and inline file navigation. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'reference'

/**
 * Simplified Chinese dictionary (the key-set source of truth).
 *
 * The `time.*` bucket words are this namespace's own copy of the session-row
 * vocabulary: locale-owned copy keeps the words per plugin, while the
 * bucketing they name is the one shared {@link relativeTime} in ui-primitives.
 */
export const zh = {
  'drag.session': '松开以引用此对话',
  'drag.file': '松开以引用此文件',
  'drag.blocked': '当前输入框无法添加引用',
  'drag.self': '不能引用当前对话',
  'drag.failed': '无法添加引用，请重试',

  'menu.addToChat': '添加到对话',
  'menu.addToChatFailed': '无法添加文件，请返回对话后重试',
  'section.files': '文件与文件夹',
  'section.subagents': '子智能体',
  'section.sessions': '对话',
  'candidate.noCwd': '（无工作目录）',
  'crumb.root': '工作区',
  'fileOpen.title': '无法打开文件',
  'fileOpen.failed': '无法打开“{path}”，请重试或关闭此提示',
  'fileOpen.close': '关闭',
  'fileOpen.retry': '重试',
  'time.now': '刚刚',
  'time.minutes': '{n}分钟',
  'time.hours': '{n}小时',
  'time.days': '{n}天',
  'time.months': '{n}个月',
  'time.years': '{n}年',
} satisfies Record<string, string>

/** The reference namespace key union. */
export type ReferenceKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Reference menu and per-file navigation feedback. */
    reference: ReferenceKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'drag.session': 'Release to reference this session',
  'drag.file': 'Release to reference this file',
  'drag.blocked': 'References cannot be added here right now',
  'drag.self': 'A session cannot reference itself',
  'drag.failed': 'Couldn’t add the reference. Try again.',

  'menu.addToChat': 'Add to chat',
  'menu.addToChatFailed': 'Couldn’t add file. Return to the chat and try again.',
  'section.files': 'Files & folders',
  'section.subagents': 'Subagents',
  'section.sessions': 'Sessions',
  'candidate.noCwd': '(no cwd)',
  'crumb.root': 'Workspace',
  'fileOpen.title': 'Couldn’t open file',
  'fileOpen.failed': 'Couldn’t open “{path}”. Try again or close this message.',
  'fileOpen.close': 'Close',
  'fileOpen.retry': 'Retry',
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<ReferenceKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'drag.session': '離してこのセッションを参照',
  'drag.file': '離してこのファイルを参照',
  'drag.blocked': '現在ここに参照を追加できません',
  'drag.self': '現在のセッションは参照できません',
  'drag.failed': '参照を追加できませんでした。再試行してください。',

  'menu.addToChat': 'チャットに追加',
  'menu.addToChatFailed': 'ファイルを追加できませんでした。チャットに戻って再試行してください。',
  'section.files': 'ファイルとフォルダ',
  'section.subagents': 'サブエージェント',
  'section.sessions': 'セッション',
  'candidate.noCwd': '（cwdなし）',
  'crumb.root': 'ワークスペース',
  'fileOpen.title': 'ファイルを開けませんでした',
  'fileOpen.failed': '「{path}」を開けませんでした。再試行するか、このメッセージを閉じてください。',
  'fileOpen.close': '閉じる',
  'fileOpen.retry': '再試行',
  'time.now': '今',
  'time.minutes': '{n}分',
  'time.hours': '{n}時間',
  'time.days': '{n}日',
  'time.months': '{n}か月',
  'time.years': '{n}年',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'drag.session': 'Suelta para referenciar esta sesión',
  'drag.file': 'Suelta para referenciar este archivo',
  'drag.blocked': 'Ahora no se pueden añadir referencias aquí',
  'drag.self': 'Una sesión no puede referenciarse a sí misma',
  'drag.failed': 'No se pudo añadir la referencia. Inténtalo de nuevo.',

  'menu.addToChat': 'Añadir al chat',
  'menu.addToChatFailed': 'No se pudo añadir el archivo. Vuelve al chat e inténtalo de nuevo.',
  'section.files': 'Archivos y carpetas',
  'section.subagents': 'Subagentes',
  'section.sessions': 'Sesiones',
  'candidate.noCwd': '(sin cwd)',
  'crumb.root': 'Espacio de trabajo',
  'fileOpen.title': 'No se pudo abrir el archivo',
  'fileOpen.failed': 'No se pudo abrir "{path}". Inténtalo de nuevo o cierra este mensaje.',
  'fileOpen.close': 'Cerrar',
  'fileOpen.retry': 'Reintentar',
  'time.now': 'ahora',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'drag.session': 'Relâchez pour référencer cette session',
  'drag.file': 'Relâchez pour référencer ce fichier',
  'drag.blocked': 'Impossible d’ajouter des références ici actuellement',
  'drag.self': 'Une session ne peut pas se référencer elle-même',
  'drag.failed': 'Impossible d’ajouter la référence. Réessayez.',

  'menu.addToChat': 'Ajouter au chat',
  'menu.addToChatFailed': 'Impossible d’ajouter le fichier. Revenez au chat et réessayez.',
  'section.files': 'Fichiers et dossiers',
  'section.subagents': 'Sous-agents',
  'section.sessions': 'Séances',
  'candidate.noCwd': '(pas de cwd)',
  'crumb.root': 'Espace de travail',
  'fileOpen.title': "Impossible d'ouvrir le fichier",
  'fileOpen.failed': "Impossible d'ouvrir \"{path}\". Réessayez ou fermez ce message.",
  'fileOpen.close': 'Fermer',
  'fileOpen.retry': 'Réessayer',
  'time.now': 'maintenant',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'drag.session': 'Loslassen, um diese Sitzung zu referenzieren',
  'drag.file': 'Loslassen, um diese Datei zu referenzieren',
  'drag.blocked': 'Hier können derzeit keine Referenzen hinzugefügt werden',
  'drag.self': 'Eine Sitzung kann sich nicht selbst referenzieren',
  'drag.failed': 'Referenz konnte nicht hinzugefügt werden. Erneut versuchen.',

  'menu.addToChat': 'Zum Chat hinzufügen',
  'menu.addToChatFailed': 'Datei konnte nicht hinzugefügt werden. Kehren Sie zum Chat zurück und versuchen Sie es erneut.',
  'section.files': 'Dateien und Ordner',
  'section.subagents': 'Subagenten',
  'section.sessions': 'Sitzungen',
  'candidate.noCwd': '(kein CWD)',
  'crumb.root': 'Arbeitsbereich',
  'fileOpen.title': 'Datei konnte nicht geöffnet werden',
  'fileOpen.failed': '„{path}“ konnte nicht geöffnet werden. Versuchen Sie es erneut oder schließen Sie diese Nachricht.',
  'fileOpen.close': 'Schließen',
  'fileOpen.retry': 'Erneut versuchen',
  'time.now': 'jetzt',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'drag.session': 'Отпустите, чтобы добавить ссылку на сеанс',
  'drag.file': 'Отпустите, чтобы добавить ссылку на файл',
  'drag.blocked': 'Сейчас здесь нельзя добавить ссылки',
  'drag.self': 'Сеанс не может ссылаться на себя',
  'drag.failed': 'Не удалось добавить ссылку. Повторите попытку.',

  'menu.addToChat': 'Добавить в чат',
  'menu.addToChatFailed': 'Не удалось добавить файл. Вернитесь в чат и повторите попытку.',
  'section.files': 'Файлы и папки',
  'section.subagents': 'Субагенты',
  'section.sessions': 'Сессии',
  'candidate.noCwd': '(без КДВ)',
  'crumb.root': 'Рабочая область',
  'fileOpen.title': 'Не удалось открыть файл',
  'fileOpen.failed': 'Не удалось открыть «{path}». Попробуйте еще раз или закройте это сообщение.',
  'fileOpen.close': 'Закрыть',
  'fileOpen.retry': 'Повторить',
  'time.now': 'сейчас',
  'time.minutes': '{n}мин',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'drag.session': 'Solte para referenciar esta sessão',
  'drag.file': 'Solte para referenciar este arquivo',
  'drag.blocked': 'Não é possível adicionar referências aqui agora',
  'drag.self': 'Uma sessão não pode referenciar a si mesma',
  'drag.failed': 'Não foi possível adicionar a referência. Tente novamente.',

  'menu.addToChat': 'Adicionar ao chat',
  'menu.addToChatFailed': 'Não foi possível adicionar o arquivo. Volte ao chat e tente novamente.',
  'section.files': 'Arquivos e pastas',
  'section.subagents': 'Subagentes',
  'section.sessions': 'Sessões',
  'candidate.noCwd': '(sem cwd)',
  'crumb.root': 'Espaço de trabalho',
  'fileOpen.title': 'Não foi possível abrir o arquivo',
  'fileOpen.failed': 'Não foi possível abrir “{path}”. Tente novamente ou feche esta mensagem.',
  'fileOpen.close': 'Fechar',
  'fileOpen.retry': 'Tentar novamente',
  'time.now': 'agora',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n} mês',
  'time.years': '{n}s',
} satisfies Record<keyof typeof en, string>
