#!/usr/bin/env node
// CLI into the running remesh_debug_app over its named pipe. Sends the args as
// one command line and prints the reply (framed by the server with a lone "."
// terminator line). Examples:
//   node tools/remesh_dbg.mjs help
//   node tools/remesh_dbg.mjs list_assets
//   node tools/remesh_dbg.mjs load_asset Simple
//   node tools/remesh_dbg.mjs set_param target_edge_length 0.05
//   node tools/remesh_dbg.mjs run_remesh
//   node tools/remesh_dbg.mjs get_state

import net from 'node:net'

const PIPE = '\\\\.\\pipe\\sculpt-remesh-debug'

const args = process.argv.slice(2)
if (args.length === 0) {
  process.stderr.write('usage: node tools/remesh_dbg.mjs <command> [args...]\n')
  process.exit(2)
}

const sock = net.connect({ path: PIPE })
let buf = ''
let done = false

const timer = setTimeout(() => {
  process.stderr.write('timeout waiting for reply (is remesh_debug_app running?)\n')
  process.exit(1)
}, 120000)

sock.on('connect', () => {
  sock.write(args.join(' ') + '\n')
})

sock.on('data', (d) => {
  buf += d.toString('utf8')
  // The server frames replies with a lone "." line: "<body>\n.\n".
  const probe = '\n' + buf
  const k = probe.indexOf('\n.\n')
  if (k !== -1 && !done) {
    done = true
    clearTimeout(timer)
    process.stdout.write(probe.slice(1, k))
    if (!probe.slice(1, k).endsWith('\n')) process.stdout.write('\n')
    sock.end()
  }
})

sock.on('error', (e) => {
  // Once the framed reply is in hand, the server tears the pipe down
  // (DisconnectNamedPipe) — the resulting EPIPE/ECONNRESET is not a failure.
  if (done) return
  clearTimeout(timer)
  process.stderr.write(`pipe error: ${e.message}\n(is remesh_debug_app running?)\n`)
  process.exit(1)
})

sock.on('close', () => {
  if (!done) {
    clearTimeout(timer)
    if (buf) process.stdout.write(buf)
    process.exit(0)
  }
})
