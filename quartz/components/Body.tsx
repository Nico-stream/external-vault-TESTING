// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
import clipboardStyle from "./styles/clipboard.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  //! CUSTOM
  return <>
    <div id="quartz-body">{children}</div>
    <div id="c-page-border"></div>
    <div id="c-header" class="gradient-container"></div>
    {/* <div id="c-explorer-fade"></div> */}
    {/* <script src="node_modules/simplebar/dist/simplebar.min.js" /> */}
  </>
}

Body.afterDOMLoaded = clipboardScript
Body.css = clipboardStyle

export default (() => Body) satisfies QuartzComponentConstructor
