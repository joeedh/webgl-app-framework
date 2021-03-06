#include <cstdio>
#include "mesh.h"

using namespace MeshLib;

extern "C" int test() {
  Mesh<float> mesh;

  VertRef v1 = mesh.makeVertex(Float3<float>(0.0, 0.0, 0.0));
  VertRef v2 = mesh.makeVertex(Float3<float>(0.0, 0.0, 0.0));
  mesh.makeEdge(v1, v2);

}

extern "C" int main() {
  Mesh<float> mesh;
    
  return 0;
}
