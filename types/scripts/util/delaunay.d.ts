export default Delaunay;
declare namespace Delaunay {
    function triangulate(vertices: any, key: any): {
        i: any;
        j: any;
        k: any;
        x: number;
        y: number;
        r: number;
    }[];
    function contains(tri: any, p: any): number[];
}
