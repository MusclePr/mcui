function basedir(path)
{
    const m = path.match(/^(.*\/).*$/);
    return (m && m.length > 0) ? m[1] : '';
}

var g_elemCmd;  // <input type="text" id="cmd">
var g_elemSend; // <input type="button" id="send">
var g_elemRefresh; // <input type="button" id="refresh">
var g_elemCtrl; // <input type="button" id="control">
var g_message;
var g_select;
var g_selectOld;

function setSelect(event)
{
    var e = event.target;
    while (e.tagName !== 'TD') {
        if (e == null) return;
        e = e.parentElement;
    }
    g_select = e;
    g_select.style.backgroundColor = '#e0e0e0';
    g_select.style.borderBottomColor = 'red';
}

function clearSelect(event)
{
    if (g_select) {
        if (g_select.className.startsWith('td-select')) {
            g_select.style.backgroundColor = '';
        } else {
            g_select.style.backgroundColor = 'transparent';
        }
        g_select.style.borderBottomColor = '';
        g_select = null;
    }
}

function onLoad(id_cmd, id_send, id_refresh, id_ctrl)
{
    g_elemCmd = id_cmd != null ? document.getElementById(id_cmd) : null;
    g_elemSend = id_send != null ? document.getElementById(id_send) : null;
    g_elemRefresh = id_refresh != null ? document.getElementById(id_refresh) : null;
    g_elemCtrl = id_ctrl != null ? document.getElementById(id_ctrl) : null;

    document.body.addEventListener("mouseup", clearSelect);
    const elements = document.getElementsByTagName('td')
    for (var i = 0; i < elements.length; i++) {
        const elem = elements[i];
        elem.addEventListener("mousedown", setSelect);
        // tdタグのbackground-colorを無効にする
        if (!elem.className.startsWith('td-select')) {
            elem.style.backgroundColor = 'transparent';
        }
    }
}

function enableInput(enable)
{
    if (enable) {
        if (g_elemSend) g_elemSend.removeAttribute('disabled'); // 「送信」ボタンの入力禁止解除
        if (g_elemRefresh) g_elemRefresh.removeAttribute('disabled'); // リフレッシュボタンの入力禁止解除
        if (g_elemCtrl) g_elemCtrl.removeAttribute('disabled'); // 制御ボタンの入力禁止解除
    } else {
        if (g_elemSend) g_elemSend.setAttribute('disabled', ''); // 「送信」ボタンの入力禁止
        if (g_elemRefresh) g_elemRefresh.setAttribute('disabled', ''); // リフレッシュボタンの入力禁止
        if (g_elemCtrl) g_elemCtrl.setAttribute('disabled', ''); // 制御ボタンの入力禁止
    }
}


function onLoadResponse()
{
    console.log(this.responseText);
    enableInput(true);
    if (g_elemCmd) g_elemCmd.value = '';
    location.reload();
}

function requestStart(uri)
{
    const req = new XMLHttpRequest();
    //req.addEventListener("progress", onProgressResponse);
    req.addEventListener("load", onLoadResponse);
    req.open("GET", uri);
    console.log(uri);
    req.send();
}

function send()
{
    if (g_elemCmd.value === '') return;

    var ok = true;
    if (g_message && g_message.length > 0) {
        if (g_message.indexOf('？') >= 0 || g_message.indexOf('?') >= 0) {
            ok = confirm(g_message);
        } else {
            alert(g_message);
        }
    }
    if (ok) {
        enableInput(false);
        var uri = location.origin + basedir(location.pathname) + 'rcon?cmd=' + g_elemCmd.value;
        //open(encodeURI(uri), 'newTab');
        requestStart(uri);
    }
}

function refresh()
{
    ok = confirm("注意：一時的に処理負荷が高まります。\n実行しますか？");
    if (ok) {
        enableInput(false);
        var uri = location.origin + basedir(location.pathname) + 'flush';
        requestStart(uri);
    }
}

function controlService(cmd)
{
    let ok = false;
    switch (cmd) {
    case 'stop':
        ok = confirm("サーバーを停止させますか？");
        break;
    case 'start':
        ok = confirm("サーバーを起動させますか？");
        break;
    default:
        console.log("unknown command: " + cmd);
        return;
    }
    if (ok) {
        enableInput(false);
        var uri = location.origin + basedir(location.pathname) + 'service/' + cmd;
        requestStart(uri);
    }
}


function set(value, message)
{
    g_elemCmd.value = value != undefined ? value : '';
    g_message = message != undefined ? message : '';
}

function setting(e, event)
{
    event.stopPropagation(); // 親階層にイベントが伝搬しない様にする
    const perms = e && e.id == "perms" && e.dataset;
    const player = e && e.parentElement.dataset;
    if (!e || !e.id) {
        g_elemCmd.value = '';
        g_message = '';
        return;
    }
    const group_switch1 = new Array('add ', 'remove ', 'remove ');
    const group_switch2 = new Array('add ', 'switchprimarygroup ', 'remove ');
    const label = player.label !== '' ? player.label : player.name;
    switch (e.id) {
    case 'online':
        if (player.online === 'true') {
            g_elemCmd.value = 'kick ' + player.name;
            g_message = label + ' さんをワールドからキックしますか？';
        } else {
            g_elemCmd.value = '';
            g_message = '';
        }
        break;
    case 'white':
        if (player.white === 'true') {
            g_elemCmd.value = 'whitelist remove ' + player.name;
            g_message = label + ' さんをホワイトリストから解除しますか？';
        } else {
            g_elemCmd.value = 'whitelist add ' + player.name;
            g_message = label + ' さんをホワイトリストに登録しますか？';
        }
        break;
    case 'ban':
        if (player.ban === 'true') {
            g_elemCmd.value = 'pardon ' + player.name;
            g_message = label + ' さんを BAN から解除しますか？';
        } else {
            g_elemCmd.value = 'ban ' + player.name;
            g_message = label + ' さんを BAN しますか？';
        }
        break;
    case 'label':
        g_elemCmd.value = 'nickset ' + player.name + ' ' + player.label;
        g_message = label + ' さんのニックネームを設定しますか？';
        break;
    case 'last':
        g_elemCmd.value = 'nickset ' + player.name;
        g_message = label + ' さんのニックネームを削除しますか？';
        break;
    case 'perms':
        let flag = perms.flag;
        let old_value = g_elemCmd.value;
        let new_value = 'lp user ' + player.name + ' parent ' + group_switch1[flag] + perms.group;
        if (old_value === new_value) {
            new_value = 'lp user ' + player.name + ' parent ' + group_switch2[flag] + perms.group;
        }
        g_elemCmd.value = new_value;
        g_message = label + ' さんのグループ設定を変更しますか？';
        break;
    default:
        console.log(e)
        break;
    }
}

