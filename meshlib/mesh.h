/*
Design constraints:
* Small codesize
* Reliable inlining behavior
*/

#include <vector>
#include <cstring>

namespace MeshLib {

typedef enum {
  CLEAR_ALLOC = 1<<0
} AttrDefFlags;

class BitMap {
  private:
    intptr_t *_chunks=0;
    int _size = 0;
    int _totchunks=0;

    constexpr static int _mask = sizeof(intptr_t) - 1;
    constexpr static int _shift = sizeof(intptr_t);

    void _resize(size_t size) {
      int totchunks = size / sizeof(intptr_t);
      intptr_t *chunks = new intptr_t(totchunks);
      
      for (int i=0; i<totchunks; i++) {
        chunks[i] = 0;
      }

      if (_chunks) {
        for (int i=0; i<_totchunks; i++) {
          chunks[i] = _chunks[i];
        }
      }

      _totchunks = totchunks;
      chunks = chunks;
    }
  public:
    BitMap(size_t size=0) {
      size = size < 32 ? 32 : size;
      _resize(size);
    }
    
    inline bool test(int bit) {
      return _chunks[bit>>_shift] & (bit & _mask);
      //return _chunks[
    }

    void set(int bit) {
      _chunks[bit>>_shift] |= bit & _mask;

    }

    void clear(int bit) {
      _chunks[bit>>_shift] &= ~(bit & _mask);
    }

    void resize(size_t size) {
      _resize(size);
    }
};


typedef int ElemRef;
typedef ElemRef VertRef;
typedef ElemRef EdgeRef;
typedef ElemRef HandleRef;
typedef ElemRef LoopRef;
typedef ElemRef LoopListRef;
typedef ElemRef FaceRef;

typedef enum {
  FLOAT=1<<0, 
  INT=1<<1,
  FLOAT2=1<<1,
  FLOAT3=1<<2,
  FLOAT4=1<<3,
  STRUCT=1<<4,
  ELEMREF=1<<5
} AttrTypes;

#define NUMTYPES 6

typedef enum {
  VERTEX=1<<0,
  EDGE=1<<1,
  HANDLE=1<<2,
  LOOP=1<<3,
  LOOPLIST=1<<4,
  FACE=1<<5
} MeshTypes;

typedef enum  {
  INTERP = 1<<0,
  MATH = 1<<1, //add, addFac, mulScalar, zero, etc
  CLEAR = 1<<2,
  FREE = 1<<3,
  INIT = 1<<4,
  COPY = 1<<5
} AttrMethods;

typedef enum {
  TEMPORARY = 1
} AttrFlags;

typedef enum {
  SELECT = 1<<0,
  HIDE = 1<<1,
  TEMP1 = 1<<2,
  UPDATE = 1<<3
} MeshFlags;

typedef size_t AttrKey;

template<class T> class ElementArray;
template<typename T, typename ELEM> class AttrRef {
public:
  ElementArray<T>& array;
  AttrKey key;
  ELEM elem;
};

template<typename Scalar> struct AttrTypeDef {
  int type;
  int elemSize;
  int flag;
  void (*interp)(void *array, Scalar weights[], size_t count);
  void (*init)(void *array, size_t count); //if elems is null, init everything, count will be 0
  void *(*alloc)(size_t count);
  void *(*realloc)(void *mem, size_t size, BitMap& freeMap);
  void (*free)(void *ptr);
};


template<typename Scalar> AttrTypeDef<Scalar> getIntDef() {
  AttrTypeDef<Scalar> def = {0};

  def.type = AttrTypes::INT;
  def.elemSize = sizeof(int);
  def.flag = AttrDefFlags::CLEAR_ALLOC;
  
  return def;
}

template<typename Scalar> AttrTypeDef<Scalar> getElemRefDef() {
  AttrTypeDef<Scalar> def = {0};

  def.type = AttrTypes::ELEMREF;
  def.elemSize = sizeof(int);
  def.flag = AttrDefFlags::CLEAR_ALLOC;
  
  return def;
}

typedef void* OpaqueAttrType;

template<typename Scalar> struct Float3 {
  private:
    Scalar vec[3];
  public:
    Float3(Scalar x, Scalar y, Scalar z) {
      vec[0] = x;
      vec[1] = y;
      vec[2] = z;
    }

    Float3() {
      vec[0] = vec[1] = vec[2] = 0.0;
    }

    inline Float3<Scalar>& operator[](size_t idx) const {
      return vec[idx];
    }
    inline Float3<Scalar>& operator[](size_t idx) {
      return vec[idx];
    }
    inline Float3<Scalar> operator+(Float3<Scalar> &b) {
      Float3<Scalar> r;

      r.vec[0] = vec[0] + b.vec[0];
      r.vec[1] = vec[1] + b.vec[1];
      r.vec[2] = vec[2] + b.vec[2];

      return r;
    }

    inline Float3<Scalar>& add(Float3<Scalar> &b) {
      vec[0] += b.vec[0];
      vec[1] += b.vec[1];
      vec[2] += b.vec[2];

      return *this; 
    }
};

template<typename Scalar> struct Attr {
    size_t size;
    size_t count;
    size_t subCount;
    char name[32];
    void *data;
    int elemType;
    AttrTypeDef<Scalar>& typeDef;

    Attr(AttrTypeDef<Scalar>& typeDef1) : typeDef(typeDef1) {
    }

    //figure out strings.  safe to use std::string?
    bool nameIs(const char *name2) {
      for (int i=0; i<sizeof(name); i++) {
        if (name[i] != name2[i]) {
          return false;
        }

        if (!name[i]) {
          break;
        }
      }

      return false;
    }
};


template<class Scalar> struct ElementArray;
template<class Scalar> class ElementIter {
  ElementArray<Scalar>& array;
  int i = 0;
  bool done = false;

  ElementIter(ElementArray<Scalar>& array1) {
    array = array1;
    
    i = 0;
    while (i < array._size && array.freeMap.test(i)) {
      i++;
    }

    if (i == array._size) {
      done = true;
    }
  }

  ElemRef operator*() {
    return i;
  }
  
  ElementIter& operator++() {
    if (done) {
      return *this;
    }

    i++;
    while (i < array._size && array.freeMap.test(i)) {
      i++;
    }

    if (i == array._size) {
      done = true;
    }

    return *this;
  }
};

template<class Scalar> struct ElementArray {
  public:
    AttrTypeDef<Scalar> types[1<<NUMTYPES];
    std::vector<Attr<Scalar>> attrs;
    std::vector<ElemRef> freeList;
    BitMap freeMap;

    int *flag;
    int *index;

    ElementArray(size_t size=32): freeMap(size) {
      _size = size;

      types[AttrTypes::INT] = getIntDef<Scalar>();
      types[AttrTypes::ELEMREF] = getElemRefDef<Scalar>();

      for (int i=0; i<size; i++) {
        freeList.push_back(size);
      }

      _length = 0;

      at_flag = addLayer(types[AttrTypes::INT], "__elem_flag");
      at_index = addLayer(types[AttrTypes::INT], "__elem_index");

      updateAliases();
    }

    ~ElementArray() {
    }

    ElementIter<Scalar> elements() {
      ElementIter<Scalar> iter(*this);
      return iter;
    }

    virtual void updateAliases() {
      flag = reinterpret_cast<int*>(attrs[at_flag].data);
      index = reinterpret_cast<int*>(attrs[at_index].data);
    }

    ElemRef newElem() {
      if (freeList.size() == 0) {
        size_t newsize = (_size<<1) - (_size>>1);
        _resize(newsize);
      }

      ElemRef elem = freeList[freeList.size()-1];
      freeList.pop_back();
      freeMap.clear(elem);

      this->flag[elem] = 0;
      this->index[elem] = -1;

      return elem;
    }

    bool freeElem(ElemRef elem) {
      freeList.push_back(elem);
      freeMap.set(elem);
      
      return true;
    }

    int addLayer(AttrTypeDef<Scalar>& typeDef, const char *name) {
      Attr<Scalar> attr(typeDef);

      strncpy(attr.name, name, sizeof(attr.name));
      attr.typeDef = typeDef;
      
      if (typeDef.alloc) {
        attr.data = typeDef.alloc(_size);
      } else {
        attr.data = malloc(_size*typeDef.elemSize);
      }

      attr.elemType = _elemType;

      if (typeDef.flag & AttrDefFlags::CLEAR_ALLOC) {
        memset(attr.data, 0, typeDef.elemSize*_size);
      }

      attrs.push_back(attr);

      return attrs.size() - 1;
    }

    int getLayer(const char *name) {
      int ilen = attrs.size();

      for (int i=0; i<ilen; i++) {
        if (attrs[i].nameIs(name)) {
          return i;
        }
      }

      return -1;
    }

    bool hasLayer(const char *name) {
      return getLayer(name) >= 0;
    }

    inline size_t size() {
      return _length;
    }
  private:
    friend class ElementIter<Scalar>;
    int at_flag;
    int at_index;
    size_t _size;
    int _elemType;
    int _length;

    void _resize(size_t newsize) {
      int ilen = attrs.size();

      freeMap.resize(newsize);

      for (int i=0; i<ilen; i++) {
        AttrTypeDef<Scalar>& def = attrs[i].typeDef;
        Attr<Scalar> &attr = attrs[i];

        void *data;

        if (def.realloc) {
          data = def.realloc(attr.data, newsize, freeMap);
        } else {
          if (def.alloc) {
            data = def.alloc(newsize);
          } else {
            data = malloc(newsize*def.elemSize);
          }

          memcpy(data, attr.data, def.elemSize*_size);
        }
        
        size_t last = _size;
        int count = newsize - last;

        if (last <= newsize) {
          continue;
        }

        if (def.init) {
          char *cp = ((char*)data) + def.elemSize*last;
          void *p = (void*) cp;

          def.init(p, count);
        }

        for (int j=0; j<count; j++) {
          freeList.push_back(last+j);
          freeMap.set(last+j);
        }
      }

      _size = newsize;

      updateAliases();
    }
};

template<class Scalar> struct VertexArray: ElementArray<Scalar> {
  public:
    Float3<Scalar> *co;
    Float3<Scalar> *no;
    EdgeRef *e;

    VertexArray() {
      ElementArray<Scalar>();

      at_co = ElementArray<Scalar>::addLayer(ElementArray<Scalar>::types[AttrTypes::FLOAT3], "__vert_co");
      at_no = ElementArray<Scalar>::addLayer(ElementArray<Scalar>::types[AttrTypes::FLOAT3], "__vert_no");
      at_e = ElementArray<Scalar>::addLayer(ElementArray<Scalar>::types[AttrTypes::ELEMREF], "__vert_e");
    }

    virtual void updateAliases() {
      ElementArray<Scalar>::updateAliases();
      
      co = reinterpret_cast<Float3<Scalar>*>(ElementArray<Scalar>::attrs[at_co].data);
      no = reinterpret_cast<Float3<Scalar>*>(ElementArray<Scalar>::attrs[at_no].data);
      e = reinterpret_cast<EdgeRef*>(ElementArray<Scalar>::attrs[at_e].data);
    }

  private:
    int at_co;
    int at_no;
    int at_e;
};

template<class Scalar> struct EdgeArray: ElementArray<Scalar> {
  public:
   VertRef *v1;
   VertRef *v2;
   LoopRef *l;
   EdgeRef *v1_next;
   EdgeRef *v1_prev;
   EdgeRef *v2_next;
   EdgeRef *v2_prev;
};

template<class Scalar> struct Mesh;
template<class Scalar> struct IterVertEdges {
  Mesh<Scalar>& mesh;
  VertRef v;
  EdgeRef e;
  bool done;

  inline IterVertEdges(Mesh<Scalar>& mesh1, VertRef v1) {
    mesh = mesh1;
    v = v1;
    e = mesh.verts.e[v1];

    done = e == -1;
  }

  inline IterVertEdges<Scalar>& operator++() {
    if (done) {
      return *this;
    }
    
    if (v == mesh.edges.v1[e]) {
      e = mesh.edges.v1_next[e];
    } else {
      e = mesh.edges.v2_next[e];
    }

    if (e == mesh.verts.e[v]) {
      done = true;
    }

    return *this;
  }

  inline EdgeRef operator*() const {
    return e;
  }
};

template<class Scalar> struct Mesh {
  public: 
  VertexArray<Scalar> verts;
  EdgeArray<Scalar> edges;

  Mesh() {
    
  }

  VertRef makeVertex(Float3<Scalar> co) {
    VertRef v = verts.newElem();
    
    verts.co[v] = co;
    verts.flag[v] = MeshFlags::UPDATE;
    verts.e[v] = -1;

    return v;
  }

  struct {
    inline IterVertEdges<Scalar> vertEdges(VertRef v) {
      IterVertEdges<Scalar> iter(*this, v);
      return iter;
    }
  } iter;

  EdgeRef makeEdge(VertRef v1, VertRef v2) {
    EdgeRef e = edges.newElem();

    edges.v1[e] = v1;
    edges.v2[e] = v2;
    
    diskInsert(v1, e);
    diskInsert(v2, e);

    return e;
  }

  void diskInsert(VertRef v, EdgeRef e) {
    VertRef v1 = edges.v1[e], v2 = edges.v2[e];

    if (verts.e[v] == -1) {
      verts.e[v] = e;

      if (v1 == v) {
        edges.v1_next[e] = edges.v1_prev[e] = e;
      } else {
        edges.v2_next[e] = edges.v2_prev[e] = e;
      }
      
      return;
    }

    if (v1 == v) {
      edges.v1_next[e] = verts.e[v];
      edges.v1_prev[e] = edges.v1_prev[verts.e[v]];
      
      edges.v1_next[edges.v1_prev[e]] = e;
      edges.v1_prev[verts.e[v]] = e;
    } else {
    }
  }

  void diskRemove(VertRef v, EdgeRef e) {
  }
};
}
