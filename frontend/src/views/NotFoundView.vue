<template>
  <section class="container nf">
    <h1>这个展位是空的</h1>
    <p>链接可能写错了，或者商品已经下架。</p>
    <RouterLink to="/" class="btn btn-primary">回到首页</RouterLink>
  </section>
</template>

<style scoped>
.nf {
  display: grid;
  justify-items: start;
  gap: 16px;
  padding-block: 96px;
}
h1 {
  font-size: var(--t-3xl);
}
p {
  color: var(--graphite);
}
</style>
