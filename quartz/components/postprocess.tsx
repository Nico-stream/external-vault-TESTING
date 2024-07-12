import { QuartzComponentConstructor } from "./types"
// @ts-ignore
import script from "./scripts/postProcess.inline"


export default (() => {
    function YourComponent() {
      return <button id="btn">Click me</button>
    }
   
    YourComponent.beforeDOM = `
    console.log("hello from before the page loads! ===DDD")
    `
   
    YourComponent.afterDOM = script

    return YourComponent
}) satisfies QuartzComponentConstructor