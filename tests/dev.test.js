const path = require('path')
const util = require('util')
const { spawn, exec } = require('child_process')
const test = require('ava')
const fetch = require('node-fetch')
const cliPath = require('./utils/cliPath')
const { randomPort } = require('./utils/')
const sitePath = path.join(__dirname, 'dummy-site')

const execProcess = util.promisify(exec)

let ps, host, port

test.before(async t => {
  console.log('Running Netlify Dev server')
  ps = await spawn(cliPath, ['dev', '-p', randomPort()], {
    cwd: sitePath,
    env: { ...process.env, DUMMY_VAR: 'true' },
    stdio: 'pipe',
    shell: true
  })
  return new Promise((resolve, reject) => {
    ps.stdout.on('data', data => {
      data = data.toString()
      if (data.includes('Server now ready on')) {
        const matches = data.match(/http:\/\/(.+):(\d+)/)

        // If we didn't get the host and port
        if (matches.length < 3) return reject('Unexpected output received from Dev server')

        port = matches.pop()
        host = matches.pop()
        resolve()
      }
    })
  })
})

test('netlify dev: /', async t => {
  const response = await fetch(`http://${host}:${port}/`).then(r => r.text())

  t.regex(response, /⊂◉‿◉つ/)
})

test('netlify dev: functions timeout', async t => {
  const response = await fetch(`http://${host}:${port}/.netlify/functions/timeout`).then(r => r.text())

  t.is(response, '"ping"')
})

test('netlify functions:invoke', async t => {
  const { stdout } = await execProcess([cliPath, 'functions:invoke', 'timeout', '--identity', '--port='+port].join(' '), {
    cwd: sitePath,
    env: process.env,
  })

  t.is(stdout, '"ping"\n')
})

test('netlify dev: functions env file', async t => {
  const response = await fetch(`http://${host}:${port}/.netlify/functions/env`).then(r => r.text())

  t.is(response, 'true')
})

test('netlify dev: functions env file overriding prod var', async t => {
  const response = await fetch(`http://${host}:${port}/.netlify/functions/override-process-env`).then(r => r.text())

  t.is(response, 'false')
})

test('netlify dev: api rewrite', async t => {
  const response = await fetch(`http://${host}:${port}/api/timeout`).then(r => r.text())

  t.is(response, '"ping"')
})

test.after.always('cleanup', async t => {
  if (ps && ps.pid) ps.kill(process.platform !== 'win32' ? 'SIGHUP' : undefined)
})
