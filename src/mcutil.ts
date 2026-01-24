import { Temporal } from "@js-temporal/polyfill"
import { NBT, TagType } from "prismarine-nbt"
import Axios from "axios"
import { existsSync } from "fs"

export namespace McUtil {

const fs = require('fs/promises')
const nbt = require('prismarine-nbt')
const prop = require("minecraft-server-properties")
const zlib = require('zlib');
const yaml = require('js-yaml')

export function replacer(key: string, value: any) : any
{
    return (typeof value === 'bigint') ? value.toString() : value;
}

export function reviver(key: string, value: any) : any
{
    return (key.match('Played')) ? BigInt(value) : value
}

(BigInt.prototype as any).toJSON = function()
{
    return this.toString()
}

export class UUID {
    uuid: string = ''
    name: string = ''
}

export class Whitelist extends UUID {
}

export class Bannedlist extends UUID {
    created: string = ''
    source: string = ''
    expires: string = ''
    reason: string = ''
}

export class Memo extends UUID {
    order: number = 0       // 連番
    label: string = ''      // ニックネーム
    comment: string = ''    // メモ
}

export class Player extends Memo {
    firstPlayed: bigint = 0n
    lastPlayed: bigint = 0n
    white: boolean = false
    ban: boolean = false
    online: boolean = false
}

export let serverProperty:any = null

// ====================================================================
// ニックネーム
// ====================================================================

export interface INicknames {
    players: { [key: string]: IPlayer };
}

export interface IPlayer {
    flag:     number;
    nickname: string;
    player:   string;
    playername?: string;
}

// ====================================================================
// 権限管理
// ====================================================================

// mcui.json の TypeScript 変換
interface ILuckPerms {
    metadata?: IMetadata
    groups?:   IGroups
    tracks?:   ITracks
    users?:    IUsers
}

interface IMetadata {
    generatedBy: string
    generatedAt: string
}

interface IGroups {
    [e: string]: INodes
}

interface ITracks {
    [e: string]: INodes
}

interface IUsers {
    [e: string]: INodesUser
}

interface INodes {
    nodes?: INode[];
}

interface INodesUser extends INodes {
    username?: string
    primaryGroup?: string
}

interface INode {
    type:  INodeType | string;
    key:   string;
    value: boolean;
}

type INodeType = "permission" | "display_name" | "inheritance" | "weight" | "meta";


export class PermsGroup {
    name: string = ''
    label: string = ''
    groups: Array<string> = []
    weight: number = 0
    constructor(name: string, group: INodes) {
        this.name = name
        this.label = name
        if (group.nodes != undefined) {
            group.nodes.forEach((node) => {
                switch (node.type) {
                    case "display_name":
                        this.label = node.key.slice("displayname.".length)
                        break
                    case "weight":
                        this.weight = parseInt(node.key.slice("weight.".length))
                        break;
                    case "inheritance":
                        this.groups.push(node.key.slice("group.".length))
                        break
                }
            })
        }
    }
    hasName(key: string) : boolean {
        return key === this.name
    }
    hasGroup(name: string) : boolean {
        return this.groups.findIndex((e) => e === name) != -1
    }
}

export class PermsUser extends UUID {
    primaryGroup: string = ''
    groups: Array<string> = []
    constructor(uuid: string, user: INodesUser) {
        super()
        this.uuid = uuid
        if (user.username != undefined) {
            this.name = user.username
        }
        if (user.primaryGroup != undefined) {
            this.primaryGroup = user.primaryGroup
        }
        if (user.nodes != undefined) {
            user.nodes.forEach((node) => {
                switch (node.type) {
                    case "inheritance":
                        this.groups.push(node.key.slice("group.".length))
                        break
                }
            })
        }
    }
    hasGroup(name: string) : boolean {
        return this.groups.findIndex((e) => e === name) != -1
    }
}

export class Perms {
    groups: Array<PermsGroup> = []
    users: Array<PermsUser> = []
    constructor(data?: ILuckPerms) {
        if (data != undefined && data.groups != undefined) {
            for (const key in data.groups) {
                let new_group = new PermsGroup(key, data.groups[key])
                this.groups.push(new_group)
            }
            // 重みでソート
            this.groups = this.groups.sort((a: PermsGroup, b: PermsGroup) => a.weight >= b.weight ? -1 : 0)
        }
        if (data != undefined && data.users != undefined) {
            for (const key in data.users) {
                let new_user = new PermsUser(key, data.users[key])
                this.users.push(new_user)
            }
        }
    }
    findUser(uuid: string) : PermsUser | undefined {
        return this.users.find((e) => e.uuid === uuid)
    }
    // グループチェック（0=非グループ/1=グループ/2=基本グループ）
    inGroup(uuid: string, group: string) : number {
        let user: PermsUser | undefined = this.findUser(uuid)
        if (user != undefined) {
            if (user.hasGroup(group)) {
                if (user.primaryGroup === group) {
                    return 2 // プライマリーグループに含まれる
                }
                return 1 // グループに含まれる
            }
        }
        return 0 // グループに含まれない
    }
    dump() : void {
        console.log(this.groups)
        console.log(this.users)
    }
}

async function Gunzip(data: any) : Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            zlib.gunzip(data, function (err: any, unzipped: any) {
                if (err) {
                    return reject(err)
                }
                resolve(unzipped.toString('utf-8'))
            })
        } catch (err) {
            reject(err)
        }
    })
}

export async function LoadPermission(dir: string) : Promise<Perms>
{
    const file: string = dir + '/plugins/LuckPerms/mcui.json.gz'
    let perms : Perms
    try {
        const binary = await fs.readFile(file)
        const text = await Gunzip(binary)
        //console.log(text);
        const data: ILuckPerms = await JSON.parse(text)
        perms = new Perms(data)
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`権限ファイルが見つかりません: ${file}`)
        } else {
            console.log(`権限ファイルの読み込みに失敗: ${err.message}`)
        }
        perms = new Perms()
    }
    return perms
}

// flag …　0=解除/1=登録/2=基本
export async function ChangePermission(container: string, username: string, group: string, flag: number) : Promise<string>
{
    const options: string = (flag >= 2 ? 'switchprimarygroup' : (flag == 1 ? 'add' : 'remove'))
    return SendRconCommand(container, 'lp user ' + username + ' parent ' + options + ' ' + group)
}

export async function ExportPermission(container: string) : Promise<string>
{
    let buffer: string = await SendRconCommand(container, 'luckperms sync')
    buffer += await SendRconCommand(container, 'luckperms export mcui')
    return buffer
}

// ====================================================================
// Docker関連のヘルパー関数
// ====================================================================

// child_process の exec を Promise 化
const util = require('util');
const childProcess = require('child_process');
const exec = util.promisify(childProcess.exec);

// 標準出力を返すだけのヘルパー関数
export async function ExecCommand(cmd: string): Promise<string>
{
    console.log(cmd)
    return exec(cmd).then(
        (result:any) => {
            if (result['stdout']) {
                console.log(result['stdout'])
                return result['stdout']
            }
            //if (result['stderr']) {
            //    retrun result['stderr']
            //}
        }
    )
}

export async function GetDockerContainerId(container: string) : Promise<string>
{
    const command: string = 'docker container ls -af "name=^' + container + '$" -q'
    return ExecCommand(command)
}

export async function GetDockerContainerStatus(container: string) : Promise<string>
{
    let status: string = 'unknown'
    const id = await GetDockerContainerId(container)
    if (id && id.length > 0) {
        const command: string = 'docker container inspect -f "{{.State.Status}}" ' + id
        return ExecCommand(command)
    }
    return status
}

export async function GetDockerContainerHealth(container: string) : Promise<string>
{
    let status: string = 'unknown'
    const id = await GetDockerContainerId(container)
    if (id && id.length > 0) {
        const command: string = 'docker container inspect -f "{{.State.Status}}" ' + id
        status = await ExecCommand(command)
        if (status.startsWith('running')) {
            const command: string = 'docker container inspect -f "{{.State.Health.Status}}" ' + id
            return ExecCommand(command)
        }
    }
    return status
}

export async function ExecDockerCommand(container: string, cmd: string) : Promise<string>
{
    let result: string = ''
    const command: string = 'docker exec ' + container + ' ' + cmd
    return ExecCommand(command)
}

export async function SendRconCommandRaw(container: string, cmd: string) : Promise<string>
{
    const command: string = 'rcon-cli ' + cmd
    // lp コマンドだけ、同期を取るために実行後に lp sync と lp export mcui を行う
    if (cmd.length >= 3 && cmd[0] == 'l' && cmd[1] == 'p' && cmd[2] == ' ') {
        let result: string = await ExecDockerCommand(container, command)
        //result += await ExecDockerCommand(container, 'rcon-cli lp sync')
        result += await ExecDockerCommand(container, 'rm -f /data/plugins/LuckPerms/mcui.json.gz') // data フォルダ決め打ち危険
        result += await ExecDockerCommand(container, 'rcon-cli lp export mcui')
        //result += await ExecDockerCommand(container, 'sync') // ファイルシステムとして flush しておかないと即時反映されない？
        return result
    }
    return ExecDockerCommand(container, command)
}

export async function SendRconCommand(container: string, cmd: string) : Promise<string>
{
    let buffer: string = await SendRconCommandRaw(container, cmd)
    // 以下の様な冒頭の余計な出力をカットする
    // Using config file: /root/.rcon-cli.env\n
    if (buffer.startsWith('Using config file:')) {
        const idx: number = buffer.indexOf("\n")
        if (idx > 0) {
            return buffer.slice(idx+1)
        }
    }
    return buffer
}


// ====================================================================
// Minecraft 関連のヘルパー関数
// ====================================================================

interface mcid {
    id: string
    name: string
}

export async function getUUIDfromName(name: string): Promise<string>
{
    const url = 'https://api.mojang.com/users/profiles/minecraft/';
    try {
        const res = await Axios.get<mcid>(url + name);
        return res.data.id;
    } catch (error) {
        // 403エラーやその他のエラーをキャッチ
        console.warn(`Failed to get UUID for ${name}:`, error);
        return ""; // 空文字を返してエラーで止まらないようにする
    }
}

export async function getOnlinePlayers(container: string)
{
    let list: UUID[] = []
    let buffer: string = await SendRconCommand(container, 'nicklist uuids')
    let debug: string = buffer.replaceAll(/\x1b/g, "x1b")   // エスケープの可視化
    buffer = buffer.replaceAll(/\x1b\[\d+m/g, "")   // エスケープシーケンスの除去
    console.log("buffer=\"" + debug + "\"")
    const lines = buffer.split('\n')

    let result: RegExpMatchArray | null = lines[0].match(/^Nicked online players (\d+)\/(\d+):/)
    if (result && result.length > 2) {
        for (let i : number = 1; i < lines.length; i++) {
            if (lines[i].length == 0) continue;
            let pair = lines[i].match(/^([\w-]+) ([\.\w]+) (.*)/)
	        //console.log(pair)
            if (pair && pair.length > 3) {
                list.push({uuid: pair[1], name: pair[2]})
            } else {
                console.log("unparsed list uuids: lines[%d]=\"%s\"", i, lines[i])
            }
        }
        return list
    }
    // ex: There are 3 of a max of 100 players online: 3483 (df0792b1-38df-45e6-890d-40e2d0a3696f), sweeeeetcoooorn (fd038138-0d7b-4b08-a4c4-45ee11059a97), Zenon_0208 (244ae9c7-8b96-45d0-96ef-d8aec3ca3486)
    buffer = await SendRconCommand(container, 'list uuids')
    result = buffer.match(/^\s*There are (\d+) of a max of (\d+) players online:\s*(.*)\s*$/)
    //console.log(result?.toString())
    if (result && result.length > 3) {
        //console.log('result[3]="%s"', result[3])
        const players = result[3].split(',')
        //console.log('players=', players)
        for (let i : number = 0; i < players.length; i++) {
            let pair = players[i].match(/^\s*([\.\w]+) \(([\w\-]+)\)/)
            if (pair && pair.length > 2) {
                //console.log("name=%s uuid=%s", pair[1], pair[2])
                list.push({uuid: pair[2], name: pair[1]})
            } else {
                console.log("unparsed list uuids: players[%d]=\"%s\"", i, players[i])
            }
        }
    } else {
        console.log('no players')
    }
    return list
}

export async function loadWhitelist(dir: string) : Promise<Whitelist[]>
{
    const file: string = dir + '/whitelist.json'
    const buffer = await fs.readFile(file, 'utf8')
    const data: Whitelist[] = await JSON.parse(buffer)
    return data
}

export async function loadBannedlist(dir: string) : Promise<Bannedlist[]>
{
    const file: string = dir + '/banned-players.json'
    const buffer = await fs.readFile(file, 'utf8')
    const data: Bannedlist[] = await JSON.parse(buffer)
    return data
}

export async function loadMemos(dir: string) : Promise<Memo[]>
{
    const file: string = dir + '/memo.json'
    let data: Memo[] = []
    
    try {
        const buffer = await fs.readFile(file, 'utf8')
        const data: Memo[] = await JSON.parse(buffer)
    } catch (err) {
        console.log("%s の読み込みに失敗。", file)
        //console.log(err)
    }
    return data
}

export async function saveMemos(dir: string, memo: Memo[])
{
    const file: string = dir + '/memo.json'
    const buffer: string = JSON.stringify(memo, replacer, 2)
    try {
        await fs.writeFile(file, buffer)
    } catch (err) {
        console.log("%s が保存できませんでした。", file)
        //console.error(err)
    }
}

export function isListed(list: UUID[], uuid: string) : boolean
{
    const hit: UUID | undefined = list.find((v) => v.uuid === uuid)
    return hit != undefined
}

export function getIndexOf(list: UUID[], uuid: string) : number
{
    const idx = list.findIndex((v) => v.uuid === uuid)
    return idx
}

export async function nbt2json(file: string)
{
  const buffer = await fs.readFile(file, 'utf8')
  const { parsed } = await nbt.parse(buffer)
  console.log(JSON.stringify(parsed, replacer, 2))
}

export async function loadProperties(dir: string) : Promise<any>
{
    const file: string = dir + '/server.properties'
    //console.log("open \"%s\"\n", file)
    const buffer = await fs.readFile(file, 'utf8')
    const output = prop.parse(buffer.toString())
    //console.log(output)
    serverProperty = output
    return output
}

/**
 * Unicode（¥uxxx形式）を文字列へアンエスケープ
 * @param {string} str エスケープされた文字列
 * @return 文字列へアンエスケープされた文字列を返す
 */
export function unescapeUnicode(str: string) : string
{
    let strs: RegExpMatchArray | null = str.match(/\\u.{4}/ig);
	if (!strs) return str;

	let result: string = ''
	for (let i: number = 0; i < strs.length; i++) {
		result += String.fromCharCode(parseInt(strs[i].replace('\\u', '0x')));
	}

	return result;
};

export async function loadLevel(dir: string) : Promise<string>
{
    const output = await loadProperties(dir)
    const world = output['level-name']
    const file : string = dir + '/' + world + '/level.dat'
    const buffer = await fs.readFile(file, 'utf8')
    const { parsed, type, metadata: { size } } = await nbt.parse(buffer)
    return parsed
}

export async function loadPlayers(dir: string)
{
    const output = await loadProperties(dir)
    const world : string = output['level-name']
    const dirPlayers : string = dir + '/' + world + '/playerdata'
    let files = await fs.readdir(dirPlayers)
    files = files.filter((item : string) => (item.match(/_old$/)) == null)
    files.forEach((f : string, i : number) => { files[i] = dirPlayers + '/' + f; })
    let players : { [uuid:string] : NBT } = {}
    for (var i : number = 0; i < files.length; i++) {
        let matches : string[] | null = files[i].match(/.*\/([\w\-]+)\.dat$/)
        if (matches && matches.length > 1 && matches[1].length == 36) {
            const uuid : string = matches[1]
            const buffer = await fs.readFile(files[i])
            const { parsed, type, metadata } = await nbt.parse(buffer)
            players[uuid] = parsed
        }
    }
    return players
}

export async function loadNicknames(dir: string) : Promise<INicknames>
{
    let file: string = dir + '/plugins/NicknameRequired/nicknames.yml'
    let data: INicknames = { players: {} }
    // 存在チェック
    if (!existsSync(file)) {
        console.log("%s が存在しません。", file)
        file = dir + '/plugins/NickAfkPartyPack/nicknames.yml'
        if (!existsSync(file)) {
            return data
        }
    }
    try {
        const buffer = await fs.readFile(file, 'utf8')
        const nicknames: INicknames = await yaml.load(buffer)
        data = nicknames
        console.log(data)
    } catch (err) {
        console.log("%s の読み込みに失敗。", file)
    }
    if (!data) {
        console.log("%s のデータが空です。", file)
        data = { players: {} }
    } else if (!data.players) {
        console.log("%s のプレイヤー情報の欠落。", file)
        data.players = {}
    }
    return data
}

export function MakeBigInt(v:[ number, number]) : bigint
{
    const UINT32MAX: number = 0x100000000
    const hi32: number = UINT32MAX * v[0] 
    const lo32: number = v[1] < 0 ? UINT32MAX + v[1] : v[1]
    return BigInt(hi32 + lo32)
}

export function MakeTimeString(t: bigint) : string
{
    // t が 0 は、無効時間と扱い、空文字とする。
    if (t == BigInt(0)) return ''
    // t はシステムミリ秒、Instant はナノ秒のため、t * 1000 * 1000倍する。
    // 1sec=1000msec, 1msec=1000μsec, 1μsec=1000nsec
    const instant = new Temporal.Instant(t * BigInt(1000000))
    const tz = 'Asia/Tokyo'
    instant.toZonedDateTimeISO(tz)
    return instant.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export async function SaveAll(container: string) : Promise<string>
{
    let result: string = await ExecDockerCommand(container, "rcon-cli save-off")
    result += await ExecDockerCommand(container, 'rm -f /data/plugins/LuckPerms/mcui.json.gz') // data フォルダ決め打ち危険
    result += await ExecDockerCommand(container, 'rcon-cli lp export mcui')
    result += await ExecDockerCommand(container, 'rcon-cli save-all flush')
    result += await ExecDockerCommand(container, 'rcon-cli save-on')
    return result
}

export async function LoadPlayerList(dir: string, container: string) : Promise<Player[]>
{
    const onlinePlayers = await getOnlinePlayers(container)
    //console.log(onlinePlayers)
    let whitelist = await loadWhitelist(dir)
    const bannedlist = await loadBannedlist(dir)
    const memos = await loadMemos(dir)
    const players = await loadPlayers(dir)
    let nicknames: INicknames = await loadNicknames(dir)
    const uuids = Object.keys(players)
    //console.log("%d\n", uuids.length)
    let playerlist: Player[] = []
    let bModified: boolean = false;
    for (let i : number = 0; i < uuids.length; i++) {
        const uuid : string = uuids[i]
        const player = players[uuid].type == TagType.Compound ? players[uuid].value : null
        const bukkit = player && player['bukkit'] && player.bukkit.type === TagType.Compound ? player.bukkit.value : null
        const lastname = bukkit && bukkit['lastKnownName'] && bukkit.lastKnownName.type === TagType.String ? bukkit.lastKnownName.value : ''
        const bukkitValues = player && player['BukkitValues'] && player.BukkitValues.type === TagType.Compound ? player.BukkitValues.value : null
        const bukkitLabel: string = bukkitValues && bukkitValues["nickafkpartypack:nickname"] && bukkitValues["nickafkpartypack:nickname"].type === TagType.String ? bukkitValues["nickafkpartypack:nickname"].value : ''
        const key: string = lastname.replace(/^\./, "__bedrock__")
        const yamlLabel: string | null = (nicknames.players && nicknames.players[key]) ? nicknames.players[key].nickname : null
        const label: string = yamlLabel ? yamlLabel : bukkitLabel
        const firstPlayed : [ number, number ] = bukkit && bukkit['firstPlayed'] && bukkit.firstPlayed.type === TagType.Long ? bukkit.firstPlayed.value : [ 0, 0 ]
        const lastPlayed : [ number, number ] = bukkit && bukkit['lastPlayed'] && bukkit.lastPlayed.type === TagType.Long ? bukkit.lastPlayed.value : [ 0, 0 ]
        const firstTime : bigint = MakeBigInt(firstPlayed)
        const lastTime : bigint = MakeBigInt(lastPlayed)
        const white = isListed(whitelist, uuid)
        const ban = isListed(bannedlist, uuid)
        const online = isListed(onlinePlayers, uuid)
        let idx: number = getIndexOf(memos, uuid)
        let comment: string = ''
        if (idx >= 0) {
            comment = memos[idx].comment
            if (memos[idx].name != lastname || memos[idx].label != label) {
                memos[idx].name = lastname
                memos[idx].label = label
                bModified = true
            }
        } else {
            idx = memos.length
            const m: Memo = { uuid: uuid, name: lastname, order: idx, label: label, comment: comment }
            memos.push(m)
            bModified = true
        }
        const data: Player = { uuid: uuid, name: lastname, order: idx, label: label, comment: comment, firstPlayed: firstTime, lastPlayed: lastTime, white: white, ban: ban, online: online }
        playerlist.push(data)
        //console.log("%d: %s: %s : %s : %s : %s : %s", i, uuid, MakeTimeString(firstTime), MakeTimeString(lastTime), white ? 'o' : '-', lastname, label);
        if (bModified) {
            saveMemos(dir, memos)
        }
        // ログイン済みならホワイトリストからメンバーを削除して、絞り込みを行う
        idx = getIndexOf(whitelist, uuid)
        if (idx >= 0) {
            whitelist.splice(idx, 1)
        }
        // ログイン済みならnicknames.ymlからメンバーを削除して、絞り込みを行う
        if (nicknames.players && nicknames.players[key]) {
            delete nicknames.players[key]
        }
    }
    // 見つからなかったホワイトリストだけ、未ログインの事前登録メンバーとして追加
    const whitelistStart: number = playerlist.length
    for (let i: number = 0; i < whitelist.length; i++) {
        const key: string = whitelist[i].name.replace(/^\./, "__bedrock__")
        const yamlLabel: string = (nicknames.players && nicknames.players[key]) ? nicknames.players[key].nickname : ''
        const data: Player = { uuid: whitelist[i].uuid, name: whitelist[i].name, order: playerlist.length, label: yamlLabel, comment: '', firstPlayed: MakeBigInt([0, 0]), lastPlayed: MakeBigInt([0, 0]), white: true, ban: false, online: false }
        playerlist.push(data)
    }
    // 見つからなかったニックネームだけ、未ログインの事前登録メンバーとして追加
    if (nicknames.players) {
        //console.log('nicknames.players: ', nicknames.players)
        for (const key in nicknames.players) {
            //console.log('key: ' + key)
            let p = nicknames.players[key]
            if (p) {
                //console.log('p: ', p)
                const rawPlayer: string = (p.player || p.playername || key)
                const name: string = rawPlayer.replace(/^__bedrock__/, ".")
                const data: Player = { uuid: '00000000-0000-0000-0000-000000000000', name: name, order: playerlist.length, label: p.nickname, comment: '', firstPlayed: MakeBigInt([0, 0]), lastPlayed: MakeBigInt([0, 0]), white: false, ban: false, online: false }
                let merged: boolean = false
                for (let i: number = whitelistStart; i < playerlist.length; i++) {
                    if (playerlist[i].name === name) {
                        playerlist[i].label = p.nickname
                        merged = true
                        break
                    }
                }
                if (!merged) {
                    playerlist.push(data)
                }
            }
        }
    }
    //console.log(playerlist)
    //console.log(JSON.stringify(players, replacer, 2))
    return playerlist
}

}
