import { describe, expect, it } from "vitest";
import { imageUrlsIn } from "./fetch";

describe("image addresses in the published page", () => {
  it("finds them escaped in the script data and as plain attributes, once each", () => {
    const html = `<script>var d=["https:\\/\\/lh7-rt.googleusercontent.com\\/slidesz\\/AGV_abc?key\\u003dXyZ\\u0026w\\u003d1600"]</script>
<img src="https://lh3.googleusercontent.com/docs/ABC=w800-h600&amp;x=1"><img src="https://lh3.googleusercontent.com/docs/ABC=w800-h600&amp;x=1">`;
    expect(imageUrlsIn(html)).toEqual(["https://lh7-rt.googleusercontent.com/slidesz/AGV_abc?key=XyZ&w=1600", "https://lh3.googleusercontent.com/docs/ABC=w800-h600&x=1"]);
    expect(imageUrlsIn("<html>rien</html>")).toEqual([]);
  });
});
