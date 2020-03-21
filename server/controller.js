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

const pipeStream = (filePath, Readpath, index, size) => {
    return new Promise(resolve =>{
        const readStream = fse.createReadStream(Readpath);
        const writeStream = fse.createWriteStream(filePath, { start: (index * size) });
        
        readStream.on('end', () =>{
            fse.unlinkSync(Readpath);
            resolve();
        })

        readStream.pipe(writeStream)
    })
}

const mergeFileChunk = async (filePath, fileHash, size) => {
    const chunkDir = path.resolve(UPLOAD_DIR,fileHash);
    const chunkPaths = await fse.readdir(chunkDir);
    chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
    
    await Promise.all( 
        chunkPaths.map((chunkPath,index) => {
            return pipeStream(filePath, Readpath = path.resolve(chunkDir,chunkPath), index, size)
        })
    )

    fse.rmdirSync(chunkDir);
}

const extractExt = filename =>
  filename.slice(filename.lastIndexOf("."), filename.length); 

const createUploadedList = async fileHash => {
    return fse.existsSync(path.resolve(UPLOAD_DIR, fileHash))? await fse.readdir(path.resolve(UPLOAD_DIR, fileHash)): []
}

module.exports = class {
    async handleMerge(req, res) {
        const data = await resolvePost(req);
        const { filename, fileHash, size } = data;
        const ext = extractExt(filename);
        const filePath = path.resolve(UPLOAD_DIR, fileHash + ext);
        await mergeFileChunk(filePath, fileHash, size);

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
                shouldUpload: true,
                uploadedList: await createUploadedList(fileHash)
            }));
        }
    }
    async handleFormData(req, res) {
        const multipart = new multiparty.Form();

        multipart.parse(req, async (error, fields, files) => {
            if (error) {
                console.error(error);
                res.status = 500;
                res.end("process file chunk failed");
                return;
            }

            const [chunk] = files.chunk;
            const [hash] = fields.hash;
            const [filename] = fields.filename;
            const [fileHash] = fields.fileHash;
            const filePath = path.resolve(UPLOAD_DIR, fileHash + extractExt(filename))

            const chunkDir = path.resolve(UPLOAD_DIR, fileHash);

            if( fse.existsSync(filePath) ) {
                res.end("file exist.");
                return;
            }

            if(!fse.existsSync(chunkDir)) {
                await fse.mkdirs(chunkDir);
            }

            await fse.move(chunk.path, path.resolve(chunkDir, hash));

            res.end("received file chunk");
        });
    }
}