import express from "express"
import fs from "fs"
import { McUtil } from './mcutil'
import { log } from "console"
//import { expressBasicAuth } from 'express-basic-auth'

// ====================================================================
// 前提モジュールの初期化
// ====================================================================

const basicAuth = require("express-basic-auth")

// express
const app: express.Express = express()

// ====================================================================
// 初期定数
// ====================================================================

// この Web サービスのポート番号
const HTTP_PORT = 8080 
const MCUI_USERNAME: string = process.env.MCUI_USERNAME || "admin"
const MCUI_PASSWORD: string = process.env.MCUI_PASSWORD || "39.da#sd-09/jXa"
// Minecraft サーバーのルートディレクトリ
const DATA_PATH: string = '/data'
// Minecraft サーバーへの Rcon 設定情報
const RCON_HOST: string = process.env.RCON_HOST || process.env.RCON_CONTAINER || ''
const CRLF: string = "\n"

// ====================================================================
// ヘルパー関数定義
// ====================================================================

// sleep関数
const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

// ====================================================================
// 初期化処理
// ====================================================================

// 終了フラグ
var doLoop : boolean = true; // true=Live接続維持または待機維持
var doStart : boolean = false; // true=Live接続開始
var doEnd : boolean = false; // true=Live接続解除

// ====================================================================
// express
// ====================================================================

var login_user : string = ''
var login_user_no : number = 0
var live_url : string = ''

// express 設定を行う
function myAuthorizer(username: string, password: string) : boolean
{
  if (basicAuth.safeCompare(username, MCUI_USERNAME) && basicAuth.safeCompare(password, MCUI_PASSWORD)) {
    login_user = username
    login_user_no = 0
    live_url = process.env.YC2MC_URL || 'live/'
    return true
  }
  // 複数のユーザー名とパスワードの許可
  for (let i: number = 1; true; i++) {
    let name_key: string = "MCUI_USERNAME_" + i
    let pass_key: string = "MCUI_PASSWORD_" + i
    if (name_key in process.env && pass_key in process.env) {
      let name: string | undefined = process.env[name_key]
      if (name == undefined) return false
      let pass: string | undefined = process.env[pass_key]
      if (pass == undefined) return false
      if (basicAuth.safeCompare(username, name) && basicAuth.safeCompare(password, pass)) {
        login_user = username
        login_user_no = i
        live_url = process.env["YC2MC_URL_" + i] || 'live-' + login_user + '/'
        return true
      }
    } else {
      break
    }
  }
  login_user = ''
  login_user_no = 0
  live_url = ''
  return false
}
function getUnauthorizedResponse() {
  return '認証エラー'
}
app.set('trust proxy', true)
app.use(basicAuth({ authorizer: myAuthorizer, unauthorizedResponse: getUnauthorizedResponse, challenge: true, realm: RCON_HOST + '/' + MCUI_USERNAME }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(__dirname + '/assets'))

function getYC2MCContainer(no: string) : string
{
  const key: string = (no == '' || no == '0') ? 'YC2MC_CONTAINER' : 'YC2MC_CONTAINER_' + no
  const container: string = process.env[key] != undefined && process.env[key] || ''
  return container
}

async function getYC2MCStatus(no: string) : Promise<string>
{
  const container: string = getYC2MCContainer(no)
  let status: string = 'unknown'
  try {
    status = await McUtil.GetDockerContainerStatus(container)
    status = status.trimEnd()
  } catch (e) {
    console.log(e)
  }
  return status
}

async function getYC2MCHealth(no: string) : Promise<boolean>
{
  const status: string = await getYC2MCStatus(no)
  switch (status) {
    case "running":
      return true
    case "created":
    case "restarting":
    case "removing":
    case "paused":
    case "exited":
    case "dead":
      break
  }
  return false
}

async function updateHTML() : Promise<string>
{
  const no: string = login_user_no.toString()
  let div_live = ''
  if (! await getYC2MCHealth(no)) {
    div_live = '\
      <button id="yc2mc-restart" onclick="requestStart(\'yc2mc/restart?no=' + no + '\');">起動</button>\
      </div><div style="display: none;">\
    '
  }
  return div_live
}

// ====================================================================
// GET処理
// ====================================================================

app.get('/logout', (req : express.Request, res: express.Response) => {
  res.status(401).send('{ "status": "401" }').end()
})

// 現在の playerlist(JSON) を得る
app.get('/playerlist', (req : express.Request, res : express.Response)=> {
  const dir: string = DATA_PATH
  McUtil.LoadPlayerList(dir, RCON_HOST).then(playerlist => {
    res.json(playerlist)
    console.log(playerlist)
    res.end()
  })
})

app.get('/rcon', (req : express.Request, res : express.Response)=> {
  console.log(req.query)
  if (req.query && req.query.cmd != undefined && typeof(req.query.cmd) === 'string') {
    const command: string = req.query.cmd
    if (command.match(/^(op |stop).*/)) {
      console.log("Illegal command.")
      res.send('Illegal command.')
    } else {
      McUtil.SendRconCommand(RCON_HOST, command).then(result => {
        console.log(result)
        res.send(result)
      })
    }
  } else {
    console.log("parameter error.")
    res.send('parameter error.')
  }
})

app.get('/flush', (req : express.Request, res : express.Response)=> {
  McUtil.SaveAll(RCON_HOST).then(result => {
    console.log(result)
    res.send(result)
  })
})

// '/whitelist/[on|off]' でホワイトリストのON/OFFを行う
app.get('/whitelist/:flag', (req : express.Request, res : express.Response)=> {
  console.log(req.params)
  if (req.params.flag === 'off') {
    McUtil.SendRconCommand(RCON_HOST, 'whitelist off').then((result) => {
      console.log(result)
      res.send(result)
    })
  } else if (req.params.flag === 'on') {
    McUtil.SendRconCommand(RCON_HOST, 'whitelist on').then((result) => {
      console.log(result)
      res.send(result)
    })
  } else {
    //res.status(400).send('Bad Request... You can use on/off only.')
    const dir: string = DATA_PATH
    McUtil.loadProperties(dir).then(() => {
      let status: string = ''
      if (McUtil.serverProperty != undefined && McUtil.serverProperty['white-list'] != undefined) {
        status = McUtil.serverProperty['white-list']
      }
      const result: string = "{ 'white-list': " + status + " }"
      console.log(result)
      res.send(result)
    })
  }
})

// yc2mc サービスの制御
app.get('/yc2mc/:flag', (req : express.Request, res : express.Response)=> {
  console.log(req.params)
  const no: string = req.query && req.query.no != undefined && typeof(req.query.no) === 'string' && req.query.no.trim() || ''
  const live_id: string = req.query && req.query.live_id != undefined && typeof(req.query.live_id) === 'string' && req.query.live_id.trim() || ''
  const container = getYC2MCContainer(no)
  if (container.length == 0) {
    console.log("unkonwn container")
    res.send("unknown container")
    return
  }
  // ライブID指定あり
  if (live_id.length > 0) {
    const command: string = 'docker container exec ' + container + ' sh -c "echo LIVE_ID=' + live_id + '> /var/tmp/.env"'
    McUtil.ExecCommand(command).then((result: string) => {
      console.log(result)
      //res.send(result)
    })
  }

  // 起動・停止・再起動
  if (req.params.flag.match('start|stop|restart') ) {
    const command: string = 'docker container ' + req.params.flag + ' ' + container
    McUtil.ExecCommand(command).then((result: string) => {
      console.log(result)
      res.send(result)
    })
  } else {
    //res.status(400).send('Bad Request... You can use on/off only.')
    McUtil.GetDockerContainerStatus(container).then((result: string) => {
      result = result.trimEnd()
      console.log("%s container is %s", container, result)
      res.send(result)
    })
  }
})

// サービスの制御
app.get('/service/:flag', (req : express.Request, res : express.Response)=> {
  console.log('service の GET リクエストを受け取りました')
  const container = RCON_HOST
  if (req.params.flag.match('start|stop|restart')) {
    const command: string = 'docker container ' + req.params.flag + ' ' + container
    McUtil.ExecCommand(command).then((result: string) => {
      console.log(result)
      res.send(result)
      // mcui で停止した場合、/data/.stop-from-mcui ファイルが作成される。
      const dir: string = DATA_PATH
      const command_care: string = (req.params.flag.match('stop') ? 'touch ' : 'rm -f ') + dir + '/.stop-from-mcui'
      console.log(command_care)
      McUtil.ExecCommand(command_care).then((result: string) => {
        console.log(result)
      })
    })
  } else {
    //res.status(400).send('Bad Request... You can use on/off only.')
    McUtil.GetDockerContainerHealth(container).then((result: string) => {
      console.log("%s container is %s", container, result)
      res.send("{ status: '" + result + "'}")
    })
  }
})

// 統合版フレンドサービスのリスタート
app.get('/xbox', (req : express.Request, res : express.Response)=> {
  console.log('xbox の GET リクエストを受け取りました')
  McUtil.ExecCommand('docker container restart xbox').then(result => {
    console.log(result)
    res.send(result)
  })
})

// デフォルト処理
app.get('/', (req : express.Request, res : express.Response)=> {
  console.log('/ の GET リクエストを受け取りました')
  const buffer : Buffer = fs.readFileSync(__dirname + '/assets/top.html')
  let text = buffer.toString()
  text = text.replaceAll('${live}', live_url)
  text = text.replaceAll('${no}', login_user_no.toString())
  text = text.replaceAll('${user}', login_user)
  res.send(text)
  res.end()
})

// サーバーステータスのHTMLページの動的な作成
app.get('/status', (req : express.Request, res : express.Response)=> {
  const dir: string = DATA_PATH
  console.log('status の GET リクエストに対し、レスポンスを返します。')
  McUtil.loadProperties(dir).then(serverProperty => {
    McUtil.GetDockerContainerHealth(RCON_HOST).then(status => {
      status = status.replace(/\r?\n/g,"")
      console.log('status: "' + status + '"')
      if (status.match('^(unknown|unhealthy|created|dead|exited|paused|removing|starting|running)')) {
        let output: string = '<!DOCTYPE HTML><html><head><meta charset="utf-8">'
        output += '<title>サーバーステータス [' + login_user + '@' + serverProperty['server-name'] + ']</title>' + CRLF
        output += '<link rel="stylesheet" href="css/style.css">' + CRLF
        output += '<script type="text/javascript" src="js/rcon-form.js"></script>' + CRLF
        output += '</head><body onLoad="onLoad(null, null, null, \'control\')">' + CRLF
        output += '<div><p><span style="font-size: large;"><b>サーバーステータス</b></span> ( ' + login_user + '@' + McUtil.unescapeUnicode(McUtil.serverProperty['motd']) + ' / stop )' + CRLF
        output += '　<input id="refresh" type="button" value="リフレッシュ" onClick="event.stopPropagation(); location.reload();">' + CRLF
        if (status.match('^(unknown|unhealthy|removing|starting|running)')) {
          output += '　<input id="control" type="button" value="起動" disabled>' + CRLF
          output += '</div>' + CRLF
          output += '<div><span id="msg">起動中</span>' + CRLF
        } else {
          output += '　<input id="control" type="button" value="起動" onClick="event.stopPropagation(); controlService(\'start\');">' + CRLF
          output += '</div>' + CRLF
          output += '<div><span id="msg">停止中</span>' + CRLF
        }
        output += '</div>' + CRLF
        output += '</body></html>' + CRLF
        //console.log(output)
        res.send(output)
        return
      }
      McUtil.LoadPlayerList(dir, RCON_HOST).then(playerlist => {
        McUtil.LoadPermission(dir).then(perms => {
          const presorted = playerlist.sort((a: McUtil.Player, b: McUtil.Player)=>{ return a.lastPlayed > b.lastPlayed ? -1 : 1 })
          const sorted = presorted.sort((a: McUtil.Player, b: McUtil.Player)=>{ return (a.online ? 1 : 0) > (b.online ? 1 : 0) ? -1 : 1 })
          const onlines = sorted.filter((e) => e.online)
          let output: string = '<!DOCTYPE HTML><html><head><meta charset="utf-8">'
          output += '<title>サーバーステータス [' + login_user + '@' + McUtil.serverProperty['server-name'] + ']</title>' + CRLF
          output += '<link rel="stylesheet" href="css/style.css">' + CRLF
          output += '<script type="text/javascript" src="js/rcon-form.js"></script>' + CRLF
          output += '</head><body onLoad="onLoad(\'cmd\', \'send\', \'refresh\', \'control\')">' + CRLF
          output += '<div><p><span style="font-size: large;"><b>サーバーステータス</b></span> ( ' + login_user + '@' + McUtil.unescapeUnicode(McUtil.serverProperty['motd']) + ' / ' + status + ' )' + CRLF
          output += '　<input id="refresh" type="button" value="リフレッシュ" onClick="event.stopPropagation(); refresh()">' + CRLF
          output += '　<input id="control" type="button" value="停止" onClick="event.stopPropagation(); controlService(\'stop\');">' + CRLF
          output += '　　<span style="font-size: x-small;"><a href="https://a-b-c-d.com/mcui/status" target="_help">Help</a></span>' + CRLF
          output += '</p></div>'
          output += '<div>/<input id="cmd" size="48" value="" autocomplete="off" placeholder="コマンド入力" onClick="event.stopPropagation();"><input id="send" type="button" value="送信" onClick="event.stopPropagation(); send()"></div>' + CRLF
          output += '<hr>' + CRLF
          const bWhitelist = McUtil.serverProperty['white-list'];
          output += '<div onClick="set(\'\')">ホワイトリスト：' + CRLF
          output += '<table border=0 style="display: inline-block; vertical-align: middle;">' + CRLF
          output += '<tr>' + CRLF
          output += '<td onClick="event.stopPropagation(); set(\'whitelist off\', \'誰でも参加可能にしますか？\')" class="td-select' + (bWhitelist ? '' : '-on')
          output += '">OFF' + CRLF
          output += '<td onClick="event.stopPropagation(); set(\'whitelist on\', \'ホワイトリストのメンバーに制限しますか？\')" class="td-select' + (bWhitelist ? '-on' : '')
          output += '">ON' + CRLF
          output += '</table>' + CRLF
          output += '</div>' + CRLF
          output += '<hr onClick="set(\'\')">' + CRLF
          output += '<div onClick="set(\'\')">プレイヤー参加履歴（' + onlines.length + '／' + sorted.length + '人）</div>' + CRLF
          output += '<div onClick="set(\'\')" class="playerlist">' + CRLF
          output += '<table border=0>' + CRLF
          output += '<thead><tr><th>名前<th>ON<th>White<th>BAN<th>最終ログイン' + CRLF
          const group_indicator: Array<string> = [ "-", "<font color=blue>✔</font>", "<font color=blue>◯</font>" ]
          for (let j: number = 0; j < perms.groups.length - 1; j++) {
            output += '<th>' + perms.groups[j].label + CRLF
          }
          output += '<tbody>' + CRLF
          for (let i: number = 0; i < sorted.length; i++) {
            const player: McUtil.Player = sorted[i]
            const label: string = player.label ? player.label : player.name;
            //output += '<tr>' + CRLF
            const bNoLogin: boolean = player.lastPlayed == 0n ? true : false
            const disabled: string = bNoLogin ? '_disabled' : ''
            output += '<tr class=tr-player' + disabled
              + ' data-uuid="' + player.uuid + '"'
              + ' data-name="' + player.name + '"'
              + ' data-label="' + player.label + '"'
              + ' data-comment="' + player.comment + '"'
              + ' data-white="' + player.white + '"'
              + ' data-ban="' + player.ban + '"'
              + ' data-online="' + player.online + '"'
              + ' data-order="' + player.order + '"'
              + '>';
            output += '<td id="label" onClick="setting(this, event)">'
            output += player.label
            output += '<br><span class=option>' + player.name + '</span>'
            output += '<td class=td-marker' + disabled + ' id="online" onClick="setting(this, event)">'
            output += player.online ? '<font color=green>✔</font>' : '-'
            output += '<td class=td-marker' + disabled + ' id="white" onClick="setting(this, event)">'
            output += player.white ? '<font color=blue>◯</font>' : '-'
            output += '<td class=td-marker' + disabled + ' id="ban" onClick="setting(this, event)">'
            output += player.ban ? '<font color=red>✖</font>' : '-'
            let lastPlayed: string = McUtil.MakeTimeString(player.lastPlayed)
            let firstPlayed: string = McUtil.MakeTimeString(player.firstPlayed)
            output += '<td class=td-small' + disabled + ' id="last" onClick="setting(this, event)">' + (bNoLogin ? '(未ログイン)' : lastPlayed)
            output += '<br><span class=option>' + firstPlayed + '</span>' + CRLF
            for (let j: number = 0; j < perms.groups.length - 1; j++) {
              let flag = perms.inGroup(player.uuid, perms.groups[j].name)
              output += '<td class=td-marker' + disabled + ' id="perms" data-group="' + perms.groups[j].name + '" data-flag="' + flag + '" onClick="setting(this, event)">' + group_indicator[flag] + CRLF
            }
          }
          output += '</table>' + CRLF
          output += '</div>' + CRLF
          output += '</body></html>' + CRLF
          //console.log(output)
          res.send(output)
        })
      })
    })
  }).catch(e => {
    console.log(e)
    res.send(e)
  })
})

// ====================================================================
// メインループ
// ====================================================================
async function main()
{
  console.log("mcui service start")
  doLoop = true
  doStart = true // 自動起動
  doEnd = false

  /*
  // サーバーがRcon接続が完了するまで接続を繰り返し待つ
  inRcon = 0
  while (inRcon == 0) {
    try {
      await rcon.connect()
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.match(/^connect ECONNREFUSED/)) {
          // No message.
        } else {
          console.log(e.message)
        }
      } else {
        console.log(e)
      }
      if (rcon.socket && !rcon.socket.connecting && rcon.socket.writable) {
        await rcon.end()
      }
      await sleep(2000)
    }
    await sleep(1000)
  }
  */
  if (!doStart) console.log("開始待機")
  while (doLoop) {
    if (doStart) {
      doStart = false
      //await liveChat.start()
      console.log("サービス開始")
    } else if (doEnd) {
      doEnd = false
      //liveChat.stop()
      doLoop = false
      console.log("終了処理開始")
    }
    await sleep(1000)
  }
  /*
  await sleep(3000)
  if (rcon.socket && !rcon.socket.connecting && rcon.socket.writable) {
    await rcon.end()
  }
  */
  console.log("終了")
}

// ====================================================================
// 安全停止設定
// ====================================================================
async function closeGracefully(signal : string)
{
  console.log(`*^!@4=> Received signal to terminate: ${signal}`)

  //liveChat.stop()
  //await rcon.end()
  console.log("安全に強制終了")
  process.exit()
}
process.on('SIGINT', closeGracefully)
process.on('SIGTERM', closeGracefully)

// ====================================================================
// メイン処理
// ====================================================================

// 8080番ポートでサーバーを待ちの状態にする。
// またサーバーが起動したことがわかるようにログを出力する
app.listen(HTTP_PORT, () => {
  console.log("Minecraft Control UIサービス起動中");
});

main().catch(console.error)

