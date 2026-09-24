import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router'
import '@fontsource/zcool-qingke-huangyou/400.css'
import '@fontsource/anton/latin-400.css'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.use(createAppRouter())
app.mount('#app')
