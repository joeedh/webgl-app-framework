export default {
  VERSION : [0, 0, 1],
  getVersion() {
    let v = this.VERSION;
    let dimen = 16;

    return v[0]*dimen*dimen + v[1]*dimen + v[2];
  }
};
