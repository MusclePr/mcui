const fs = require('fs/promises')
const nbt = require('prismarine-nbt')

// sleep関数
//const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec))

async function nbt2json(file) {
  const buffer = await fs.readFile(file)
  const { parsed, type, metadata: { size } } = await nbt.parse(buffer)
  console.log(JSON.stringify(parsed, null, 2))
}

if (process.argv.length > 2) {
    nbt2json(process.argv[2])
} else {
    console.log("usage: node nbt2json <nbt-file>\n")
    process.exit(-1)
}
