import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { readFileSync } from 'node:fs'

const REPLIES = JSON.parse(readFileSync(new URL('./replies.json', import.meta.url)))
const ONLY_PRIVATE_CHATS = true
const DEFAULT_REPLY_COOLDOWN_MS = 4 * 60 * 60 * 1000 // jangan kirim balasan default berulang ke kontak yang sama dalam 4 jam

const lastDefaultReplyAt = new Map()

function extractText(message) {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    ''
  )
}

function findReply(text) {
  const lower = text.toLowerCase()
  for (const [name, category] of Object.entries(REPLIES)) {
    if (name === 'default') continue
    if (category.keywords?.some((kw) => lower.includes(kw.toLowerCase()))) {
      return category.reply
    }
  }
  return null
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log('Scan QR ini dengan WhatsApp di HP (Perangkat Tertaut > Tautkan Perangkat):')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log('Koneksi terputus.', shouldReconnect ? 'Menyambung ulang...' : 'Logout, hapus folder auth_info/ untuk login ulang.')
      if (shouldReconnect) start()
    } else if (connection === 'open') {
      console.log('Bot WhatsApp tersambung dan siap membalas otomatis.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      const jid = msg.key.remoteJid
      if (!jid) continue
      if (ONLY_PRIVATE_CHATS && jid.endsWith('@g.us')) continue

      const text = extractText(msg.message)
      if (!text) continue

      const keywordReply = findReply(text)
      if (keywordReply) {
        await sock.sendMessage(jid, { text: keywordReply })
        continue
      }

      const now = Date.now()
      const lastSent = lastDefaultReplyAt.get(jid) ?? 0
      if (now - lastSent > DEFAULT_REPLY_COOLDOWN_MS) {
        await sock.sendMessage(jid, { text: REPLIES.default.reply })
        lastDefaultReplyAt.set(jid, now)
      }
    }
  })
}

start()
