const path = require("path");
const fse = require("fs-extra");
const multiparty = require("multiparty");

const UPLOAD_DIR = path.resolve(__dirname,"..","target");

const resolvePost = (req) => {
    return new Promise(resolve => {
        let chunk = "";
        req.on("data", data =>{
            chunk += data;
        })
        req.on("end", () =>{
            resolve(JSON.parse(chunk));
        })
    });
};

const mergeFileChunk = async (filePath, filename) => {
    const chunkDir = path.resolve(UPLOAD_DIR,filename);
    const chunkPaths = await fse.readdir(chunkDir);
    await fse.writeFileSync(filePath, "");
    chunkPaths.forEach(chunkPath => {
        fse.appendFileSync(filePath, fse.readFileSync(path.resolve(chunkDir,chunkPath)));
        fse.unlinkSync(path.resolve(chunkDir,chunkPath));
    })

    fse.rmdirSync(chunkDir);
}

const extractExt = filename =>
  filename.slice(filename.lastIndexOf("."), filename.length); 

module.exports = class {
    async handleMerge(req, res) {
        const data = await resolvePost(req);
        const { filename } = data;
        const filePath = path.resolve(UPLOAD_DIR, filename);
        await mergeFileChunk(filePath, filename);

        res.end(JSON.stringify({
            code: 200,
            msg: "file merged success"
        }))
    }
    async handleVerify(req, res) {
        const data = await resolvePost(req);
        const { fileHash, filename } = data;
        const ext = extractExt(filename);
        const filePath = path.resolve(UPLOAD_DIR, fileHash + ext);
        if ( fse.existsSync(filePath) ) {
            res.end(JSON.stringify({
                shouldUpload: false
            }));
        } else {
            res.end(JSON.stringify({
                shouldUpload: true
            }));
        }
    }
    async handleFormData(req, res) {
        const multipart = new multiparty.Form();

        multipart.parse(req, async (error, fields, files) => {
            if (error) return

            const [chunk] = files.chunk;
            const [hash] = fields.hash;
            const [filename] = fields.filename;
            const chunkDir = path.resolve(UPLOAD_DIR, filename);

            if(!fse.existsSync(chunkDir)) {
                await fse.mkdirs(chunkDir);
            }

            await fse.move(chunk.path, path.resolve(chunkDir, hash));

            res.end("received file chunk");
        })
    }
}