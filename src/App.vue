<template>
  <div id="app">
    <fileTransferProtocol>
    </fileTransferProtocol>
  </div>
</template>

<script>
import fileTransferProtocol from './components/fileTransferProtocol.vue'

export default {
  name: 'App',
  components: {
    fileTransferProtocol
  }
}
</script>

<style>
#app{
  padding: 20px;
  margin: 20px;
  border: 1px solid #999;
}
</style>
