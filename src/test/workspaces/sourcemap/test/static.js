"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert = __importStar(require("assert"));
describe("Suite #1", function () {
    it("Test #1.1", function () {
        assert.equal(1, 1);
    });
    it("Test #1.2", function () {
        assert.equal(1, 2);
    });
    it.skip("Test #1.3", function () {
    });
});
describe.skip("Suite #2", function () {
    it("Test #2.1", function () {
    });
});
//# sourceMappingURL=static.js.map