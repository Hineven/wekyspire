<template>
  <div id="debug-app">
  </div>
</template>

<script>

export default {
  name: 'DebugApp',
  components: {
  }
};
</script>

<style>
#debug-app {
  height: 100vh;
  overflow: hidden;
  display: flex;
}

#debug-app > div {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>