import { describe, expect, it } from "vitest";
import { imageUrlsIn, pageSummary } from "./fetch";

describe("image addresses in the published page", () => {
  it("finds them escaped in the script data and as plain attributes, once each", () => {
    const html = `<script>var d=["https:\\/\\/lh7-rt.googleusercontent.com\\/slidesz\\/AGV_abc?key\\u003dXyZ\\u0026w\\u003d1600"]</script>
<img src="https://lh3.googleusercontent.com/docs/ABC=w800-h600&amp;x=1"><img src="https://lh3.googleusercontent.com/docs/ABC=w800-h600&amp;x=1">`;
    expect(imageUrlsIn(html)).toEqual(["https://lh7-rt.googleusercontent.com/slidesz/AGV_abc?key=XyZ&w=1600", "https://lh3.googleusercontent.com/docs/ABC=w800-h600&x=1"]);
    expect(imageUrlsIn("<html>rien</html>")).toEqual([]);
  });

  it("reads hex escapes and every googleusercontent host, and says what the page holds when nothing is found", () => {
    const html = `x="https\\x3a\\x2f\\x2flh7-us.googleusercontent.com\\x2fslidesz\\x2fAbc\\x3dw1600"; y="https://docs.google.com/presentation/d/e/2PACX-x/image?id=p1"`;
    expect(imageUrlsIn(html)).toEqual(["https://lh7-us.googleusercontent.com/slidesz/Abc=w1600", "https://docs.google.com/presentation/d/e/2PACX-x/image?id=p1"]);
    expect(pageSummary('<script src="https://www.gstatic.com/a.js"></script>')).toBe("hôtes : www.gstatic.com");
  });
});

