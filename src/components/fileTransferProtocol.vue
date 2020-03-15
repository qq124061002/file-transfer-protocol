<template>
<div>
    <div class="upload-box">
        <input type="file" @change="fileChangeHandler">
        <el-button @click="handleUpload" :disabled="uploadDisabled">上传</el-button>
        <el-button @click="handlePause" :disabled="pauseDisabled">暂停</el-button>
        <el-button @click="handleResume" :disabled="resumeDisabled">恢复</el-button>
    </div>
    <div>
        <div>计算文件 hash</div>
        <el-progress :percentage="hashPercentage"></el-progress>
        <div>总进度</div>
        <el-progress :percentage="fakeUploadPercentage"></el-progress>
    </div>
    <el-table :data="data">
        <el-table-column
            prop="hash"
            label="切片hash"
            align="center"
        ></el-table-column>
        <el-table-column label="大小(KB)" align="center" width="120">
            <template v-slot="{ row }">
            {{ row.size | transformByte }}
            </template>
        </el-table-column>
        <el-table-column label="进度" align="center">
            <template v-slot="{ row }">
            <el-progress
                :percentage="row.percentage"
                color="#1AAD19"
            ></el-progress>
            </template>
        </el-table-column>
    </el-table>
</div>

</template>

<script>
const SIZE = 10 * 1024 * 1024;

export default {
    name: 'fileTransferProtocol',
    data: () => ({
        container: {
            file: null
        },
        data: [],
        requestList: [],
        uploadDisabled: false,
        pauseDisabled: true,
        resumeDisabled: true,
        fakeUploadPercentage: 0,
        hashPercentage: 0
    }),
    filters: {
        transformByte(val) {
            return Number((val / 1024).toFixed(0));
        }
    },
    computed: {
        uploadPercentage() {
            if (!this.container.file || !this.data.length) return 0;

            const loaded = this.data.map((item) => {
                return item.size * item.percentage
            }).reduce((sum, cur) => (sum + cur));

            return parseInt((loaded / this.container.file.size).toFixed(2));
        }
    },
    watch: {
        uploadPercentage(newVal) {
            if(this.fakeUploadPercentage < newVal) {
                this.fakeUploadPercentage = newVal;
            }
        }
    },
    methods: {
        fileChangeHandler(e) {
            const [file] = e.target.files;
            if (!file) return;

            //重置$data
            Object.assign(this.$data, this.$options.data());

            this.container.file = file;
        },
        fileSplit(file,size = SIZE) {
            let fileChunkList = [];
            let cur = 0;

            while ( cur < file.size ) {
                fileChunkList.push({
                    file: file.slice(cur, cur + size)
                })

                cur += size;
            }

            return fileChunkList;

        },
        async uploadChunks(uploadedList = []) {
            this.pauseDisabled = false;

            const requestList = this.data.filter(({ hash }) =>{
                return !uploadedList.includes(hash)
            }).map((item) => {
                const formData = new FormData();
                formData.append("chunk",item.chunk);
                formData.append("hash",item.hash);
                formData.append("filename", this.container.file.name);
                formData.append("fileHash", this.container.hash);

                return formData;
            }).map(async (formdata,index) => {
                this.request({
                    url: "http://localhost:3000/upload",
                    data: formdata,
                    onProgress: this.createProgressHandler(this.data[index]),
                    requestList: this.requestList
                })
            })

            await Promise.all(requestList);
            
            if(uploadedList.length + requestList.length === this.data.length) {
                await this.mergeRequest();
            }
        },
        async mergeRequest() {
            await this.request({
                url: "http://localhost:3000/merge",
                headers: {
                    "content-type": "application/json"
                },
                data: JSON.stringify({
                    filename: this.container.file.name,
                    fileHash: this.container.hash
                })
            })
        },
        async verifyUpload(filename, fileHash) {
            const { data } = await this.request({
                url: "http://localhost:3000/verify",
                headers: {
                    "content-type": "application/json"
                },
                data: JSON.stringify({
                    filename: filename,
                    fileHash: fileHash
                })
            });

            return JSON.parse(data);
        },
        calculateHash(fileChunkList) {
            return new Promise(resolve => {
                this.container.worker = new Worker("/hash.js");
                this.container.worker.postMessage({ fileChunkList });
                this.container.worker.onmessage = e => {
                    const { percentage, hash } = e.data;
                    this.hashPercentage = Math.ceil(percentage);
                    if( hash ) {
                        resolve(hash);
                    }
                }
            })
        },
        async handleResume() {
            this.resumeDisabled = true;

            const { uploadedList } = await this.verifyUpload(
                this.container.file.name,
                this.container.hash
            )

            await this.uploadChunks(uploadedList);
        },
        async handleUpload() {
            if(!this.container.file) return;
            const fileChunkList = this.fileSplit(this.container.file);
            this.container.hash = await this.calculateHash(fileChunkList);

            const { shouldUpload, uploadedList } = await this.verifyUpload(
                this.container.file.name,
                this.container.hash
            )

            if(!shouldUpload) {
                this.$message.success("秒传：上传成功");
                return;
            }

            this.data = fileChunkList.map((fileChunk,index) => ({
                    fileHash: this.container.hash,
                    chunk: fileChunk.file,
                    index: index,
                    hash: this.container.file.name + '_' + index,
                    size: fileChunk.file.size,
                    percentage: 0
            }));

            await this.uploadChunks(uploadedList);
        },
        createProgressHandler(item) {
            return e => {
                item.percentage = e.loaded == e. total?100:0;
            }
        },
        handlePause(){
            this.requestList.forEach(xhr =>{
                xhr?.abort();
            })

            this.requestList = [];
            this.pauseDisabled = true;
            this.resumeDisabled = false;
        },
        request({
            url,
            methods = 'POST',
            headers = {},
            data,
            onProgress = e => e,
            requestList
            }) {
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.onprogress = onProgress;
                xhr.open(methods,url);

                Object.keys(headers).forEach(key =>
                    xhr.setRequestHeader(key, headers[key])
                );

                xhr.send(data);
                xhr.onload = (e) => {

                    if (requestList) {
                        const xhrIndex = requestList.findIndex((item) => {
                            return item===xhr
                        })
                        requestList.splice(xhrIndex, 1);
                    }

                    resolve({
                        data: e.target.response
                    })
                }

                requestList?.push(xhr);
            })
        }
    }
}
</script>

<style scoped>

</style>
