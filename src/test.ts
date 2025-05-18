import { McUtil } from './mcutil'

// sleep関数
//const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

const TEST_DEFAULT: string = "mk"

const RCON_CONTAINER: string = process.env.RCON_CONTAINER || TEST_DEFAULT

async function main()
{
    const container = RCON_CONTAINER
    const dir: string = process.argv.length > 2 ? process.argv[2] : "/opt/docker/mc/" + container + "/data"
    console.log("McUtil.LoadPlayerList(\"%s\")", dir)
    const playerlist = await McUtil.LoadPlayerList(dir, container)
    const buffer: string = JSON.stringify(playerlist, McUtil.replacer, 2)
    const playerlist2 = JSON.parse(buffer, McUtil.reviver)
    const buffer2: string = JSON.stringify(playerlist2, McUtil.replacer, 2)
    if (buffer != buffer2) {
        console.log('==========')
        console.log(playerlist)
        console.log('----------')
        console.log(playerlist2)
        console.log('==========')
    } else {
        console.log(playerlist2)
    }
    if (0) {
        const testtime = McUtil.MakeBigInt([388, -929322217])
        console.log(testtime.toString())
        console.log(McUtil.MakeTimeString(testtime))
    }
    if (0) {
        console.log(`整数の最小値: ${Number.MIN_SAFE_INTEGER}`)
        console.log(`整数の最大値: ${Number.MAX_SAFE_INTEGER}`)
    }
    if (0) {
        console.log('ホワイトリスト：', McUtil.serverProperty['white-list'])
        console.log(McUtil.serverProperty)
    }

    if (0) {
        const status = await McUtil.GetDockerContainerStatus(container)
        console.log("%s container is %s", container, status)
    }

    if (0) {    // ホワイトリストの削除＆追加
        const player: string = '.MusclePr' 
        let command: string = 'whitelist remove ' + player
        console.log(await McUtil.SendRconCommand(container, command))
        console.log(await McUtil.loadWhitelist(dir))
        command = 'whitelist add ' + player
        console.log(await McUtil.SendRconCommand(container, command))
        console.log(await McUtil.loadWhitelist(dir))
    }

    if (1) {
        const data = await McUtil.LoadPermission(dir)
        data.dump()
    }

}

main().catch(console.error)
