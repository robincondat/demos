import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCLAHE, validateCLAHE, CLAHE_DEFAULTS } from "../compute/clahe.js";
import { createImage } from "../compute/image.js";

test("CLAHE validates contrast and grid dimensions before native allocations", () => {
  validateCLAHE(CLAHE_DEFAULTS);
  validateCLAHE({clipLimit:0,tilesX:1,tilesY:1});
  for (const settings of [{clipLimit:NaN},{clipLimit:-1},{tilesX:0},{tilesY:1.5},{tilesX:Infinity},{tilesY:257}])
    assert.throws(()=>validateCLAHE({...CLAHE_DEFAULTS,...settings}));
});

test("CLAHE keeps source pixels, treats RGB channels independently and frees native resources on success or failure", () => {
  for (const fail of [false,true]) {
    const objects=[];
    class Resource {
      constructor(){objects.push(this);}
      delete(){assert.ok(!this.deleted);this.deleted=true;}
    }
    const source=createImage({width:2,height:1,channels:3,data:new Uint8Array([1,2,3,4,5,6])});
    const cv={CV_8UC1:0,Size:class {},Mat:class extends Resource {
      constructor(height,width){super();this.data=new Uint8Array((height??1)*(width??2));}
    },CLAHE:class extends Resource {
      apply(src,dst){if(fail)throw Error("native failure");dst.data=Uint8Array.from(src.data,value=>value+1);}
    }};
    if (fail) assert.throws(()=>applyCLAHE(source,CLAHE_DEFAULTS,cv),/native failure/);
    else assert.deepEqual([...applyCLAHE(source,CLAHE_DEFAULTS,cv).data],[2,3,4,5,6,7]);
    assert.deepEqual([...source.data],[1,2,3,4,5,6]);
    assert.ok(objects.every(value=>value.deleted));
  }
});
