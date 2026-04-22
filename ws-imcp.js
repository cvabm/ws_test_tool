const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WS_URL = 'ws://10.8.5.40:10020/imcp';
const LOG_DIR = './ws-logs';

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let currentLogStream = null;
let currentDate = null;
let ws = null;

// ========== 时间格式化（北京时间） ==========
function getBeijingTime() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getUTCDate()).padStart(2, '0');
    const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
    
    return {
        full: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
        date: `${year}-${month}-${day}`
    };
}

// ========== 按天切换文件 ==========
function getLogFilePath() {
    const { date } = getBeijingTime();
    return path.join(LOG_DIR, `ws-${date}.log`);
}

function rotateLogFile() {
    const { date, full } = getBeijingTime();
    
    if (currentDate !== date) {
        if (currentLogStream) {
            currentLogStream.end();
        }
        const newFilePath = getLogFilePath();
        currentLogStream = fs.createWriteStream(newFilePath, { flags: 'a' });
        currentDate = date;
        // 会话开始时记录连接地址
        currentLogStream.write(`\n--- 新会话开始: ${full} ---\n`);
        currentLogStream.write(`[连接地址] ${WS_URL}\n`);
        console.log(`[日志文件] ${newFilePath}`);
    }
}

// ========== 写入消息到文件 ==========
function writeToFile(message, isIncoming = true) {
    rotateLogFile();
    const { full } = getBeijingTime();
    const direction = isIncoming ? '<-' : '->';
    
    let content = message;
    try {
        const parsed = JSON.parse(message);
        content = JSON.stringify(parsed, null, 2);
    } catch (e) {}
    
    const logLine = `[${full}] ${direction} ${content}\n`;
    currentLogStream.write(logLine);
}

// ========== 打印消息到控制台 ==========
function printToConsole(direction, time, message) {
    const arrow = direction === 'send' ? '[发送]' : '[收到]';
    
    let formatted = message;
    try {
        const parsed = JSON.parse(message);
        formatted = JSON.stringify(parsed, null, 2);
    } catch (e) {}
    
    console.log(`\n${arrow} [${time}]`);
    console.log(formatted);
    console.log('> ');
}

// ========== 发送消息 ==========
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        writeToFile(message, false);
        const { full } = getBeijingTime();
        printToConsole('send', full, message);
        return true;
    } else {
        const { full } = getBeijingTime();
        console.log(`\n[错误] [${full}] 未连接`);
        console.log('> ');
        return false;
    }
}

// ========== WebSocket 连接 ==========
function connect() {
    const { full } = getBeijingTime();
    console.log(`\n[连接] [${full}] 正在连接 ${WS_URL}`);
    
    ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
        const { full } = getBeijingTime();
        // 记录连接成功状态到文件，包含子协议确认
        const protocol = ws.protocol || '无';
        writeToFile(`连接成功，子协议: ${protocol}`, false);
        console.log(`[成功] [${full}] 连接成功！子协议: ${protocol}`);
        console.log(`[提示] 可以发送消息了，输入后按回车\n`);
        console.log('> ');
    });
    
    ws.on('message', (data) => {
        const messageStr = data.toString();
        const { full } = getBeijingTime();
        
        writeToFile(messageStr, true);
        setImmediate(() => {
            printToConsole('receive', full, messageStr);
        });
    });
    
    ws.on('error', (error) => {
        const { full } = getBeijingTime();
        writeToFile(`错误: ${error.message}`, false);
        console.log(`\n[错误] [${full}] ${error.message}`);
        console.log('> ');
    });
    
    ws.on('close', (code, reason) => {
        const { full } = getBeijingTime();
        writeToFile(`连接关闭 [${code}] ${reason || '无原因'}`, false);
        console.log(`\n[关闭] [${full}] 连接关闭 [${code}] ${reason || '无原因'}`);
        console.log(`[重连] 将在5秒后重连...`);
        setTimeout(() => connect(), 5000);
    });
}

// ========== 用户输入处理 ==========
function promptUser() {
    rl.question('', (input) => {
        if (input.trim() === '') {
            promptUser();
            return;
        }
        
        if (input === '/quit' || input === '/exit') {
            gracefulShutdown();
            return;
        }
        
        if (input === '/status') {
            const state = ws ? ws.readyState : 'null';
            const stateMap = { 0: '连接中', 1: '已连接', 2: '关闭中', 3: '已关闭' };
            const { full } = getBeijingTime();
            console.log(`\n[状态] [${full}] 连接状态: ${stateMap[state] || state}`);
            console.log('> ');
            promptUser();
            return;
        }
        
        sendMessage(input);
        promptUser();
    });
}

// ========== 优雅退出 ==========
function gracefulShutdown() {
    const { full } = getBeijingTime();
    console.log(`\n[关闭] [${full}] 正在关闭...`);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    if (currentLogStream) {
        currentLogStream.write(`--- 会话结束: ${full} ---\n`);
        currentLogStream.end();
    }
    rl.close();
    setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', gracefulShutdown);

// ========== 启动 ==========
connect();
const { full } = getBeijingTime();
console.log(`\n[WebSocket 调试器]`);
console.log(`[日志目录] ${path.resolve(LOG_DIR)}`);
console.log(`[当前时间] ${full} (北京时间)`);
console.log(`[命令] /status 查看状态, /quit 退出\n`);

setTimeout(() => {
    promptUser();
}, 1000);