"use strict";
//adapted from icon-gen code
if (window.haveElectron) {
  let fs = require("fs");
  let path = require("path");
  let pngjsNozlib = require("pngjs-nozlib");
  let png = require("pngjs");

  const REQUIRED_IMAGE_SIZES = [16, 24, 32, 48, 64, 128, 256];

  const DEFAULT_FILE_NAME = 'app';
  const FILE_EXTENSION = '.ico';

  const HEADER_SIZE = 6;

  const DIRECTORY_SIZE = 16;
  const BITMAPINFOHEADER_SIZE = 40;
  const BI_RGB = 0;
  /**
   * Convert a PNG of the byte array to the DIB (Device Independent Bitmap) format.
   * PNG in color RGBA (and more), the coordinate structure is the Top/Left to Bottom/Right.
   * DIB in color BGRA, the coordinate structure is the Bottom/Left to Top/Right.
   * @param {Buffer} src Target image.
   * @param {Number} width The width of the image.
   * @param {Number} height The height of the image.
   * @param {Number} bpp The bit per pixel of the image.
   * @return {Buffer} Converted image
   * @see https://en.wikipedia.org/wiki/BMP_file_format
   */

  const convertPNGtoDIB = (src, width, height, bpp) => {
    const cols = width * bpp;
    const rows = height * cols;
    const rowEnd = rows - cols;
    const dest = Buffer.alloc(src.length);

    for (let row = 0; row < rows; row += cols) {
      for (let col = 0; col < cols; col += bpp) {
        // RGBA: Top/Left -> Bottom/Right
        let pos = row + col;
        const r = src.readUInt8(pos);
        const g = src.readUInt8(pos + 1);
        const b = src.readUInt8(pos + 2);
        const a = src.readUInt8(pos + 3); // BGRA: Right/Left -> Top/Right

        pos = rowEnd - row + col;
        dest.writeUInt8(b, pos);
        dest.writeUInt8(g, pos + 1);
        dest.writeUInt8(r, pos + 2);
        dest.writeUInt8(a, pos + 3);
      }
    }

    return dest;
  };
  /**
   * Create the BITMAPINFOHEADER.
   * @param {Object} png PNG image.
   * @param {Number} compression Compression mode
   * @return {Buffer} BITMAPINFOHEADER data.
   * @see https://msdn.microsoft.com/ja-jp/library/windows/desktop/dd183376%28v=vs.85%29.aspx
   */


  const createBitmapInfoHeader = (png, compression) => {
    const b = Buffer.alloc(BITMAPINFOHEADER_SIZE);
    b.writeUInt32LE(BITMAPINFOHEADER_SIZE, 0); // 4 DWORD biSize

    b.writeInt32LE(png.width, 4); // 4 LONG  biWidth

    b.writeInt32LE(png.height * 2, 8); // 4 LONG  biHeight

    b.writeUInt16LE(1, 12); // 2 WORD  biPlanes

    b.writeUInt16LE(png.bpp * 8, 14); // 2 WORD  biBitCount

    b.writeUInt32LE(compression, 16); // 4 DWORD biCompression

    b.writeUInt32LE(png.data.length, 20); // 4 DWORD biSizeImage

    b.writeInt32LE(0, 24); // 4 LONG  biXPelsPerMeter

    b.writeInt32LE(0, 28); // 4 LONG  biYPelsPerMeter

    b.writeUInt32LE(0, 32); // 4 DWORD biClrUsed

    b.writeUInt32LE(0, 36); // 4 DWORD biClrImportant

    return b;
  };
  /**
   * Create the Icon entry.
   *
   * @param {Object} png    PNG image.
   * @param {Number} offset The offset of directory data from the beginning of the ICO/CUR file
   *
   * @return {Buffer} Directory data.
   *
   * @see https://msdn.microsoft.com/en-us/library/ms997538.aspx
   */


  const createDirectory = (png, offset) => {
    const b = Buffer.alloc(DIRECTORY_SIZE);
    const size = png.data.length + BITMAPINFOHEADER_SIZE;
    const width = 256 <= png.width ? 0 : png.width;
    const height = 256 <= png.height ? 0 : png.height;
    const bpp = png.bpp * 8;
    b.writeUInt8(width, 0); // 1 BYTE  Image width

    b.writeUInt8(height, 1); // 1 BYTE  Image height

    b.writeUInt8(0, 2); // 1 BYTE  Colors

    b.writeUInt8(0, 3); // 1 BYTE  Reserved

    b.writeUInt16LE(1, 4); // 2 WORD  Color planes

    b.writeUInt16LE(bpp, 6); // 2 WORD  Bit per pixel

    b.writeUInt32LE(size, 8); // 4 DWORD Bitmap (DIB) size

    b.writeUInt32LE(offset, 12); // 4 DWORD Offset

    return b;
  };
  /**
   * Create the ICO file header.
   * @param {Number} count Specifies number of images in the file.
   * @return {Buffer} Header data.
   * @see https://msdn.microsoft.com/en-us/library/ms997538.aspx
   */


  const createFileHeader = count => {
    const b = Buffer.alloc(HEADER_SIZE);
    b.writeUInt16LE(0, 0); // 2 WORD Reserved

    b.writeUInt16LE(1, 2); // 2 WORD Type

    b.writeUInt16LE(count, 4); // 2 WORD Image count

    return b;
  };
  /**
   * Check an option properties.
   * @param {Object} options Output destination the path of directory.
   * @param {String} options.name Name of an output file.
   * @param {Number[]} options.sizes Structure of an image sizes.
   * @returns {Object} Checked options.
   */


  const checkOptions = options => {
    if (options) {
      return {
        name: typeof options.name === 'string' && options.name !== '' ? options.name : DEFAULT_FILE_NAME,
        sizes: Array.isArray(options.sizes) ? options.sizes : REQUIRED_IMAGE_SIZES
      };
    } else {
      return {
        name: DEFAULT_FILE_NAME,
        sizes: REQUIRED_IMAGE_SIZES
      };
    }
  };
  /**
   * Get the size of the required PNG.
   * @return {Number[]} Sizes.
   */


  const GetRequiredICOImageSizes = () => {
    return REQUIRED_IMAGE_SIZES;
  };
  /**
   * Generate the ICO file from a PNG images.
   * @param {ImageInfo[]} images File informations..
   * @param {String} dir Output destination the path of directory.
   * @param {Object} options Options.
   * @param {String} options.name Name of an output file.
   * @param {Number} options.sizes Structure of an image sizes.
   * @param {Logger} logger Logger.
   * @return {Promise} Promise object.
   */


  let stream = require("stream");

  class WriteStream extends stream.Writable {
    constructor() {
      super();
      this.data = [];
    }

    _write(chunk, encoding, cb) {
      let buf = chunk;

      if (!(buf instanceof Buffer)) {
        Buffer.from(chunk, encoding);
      }

      for (let i = 0; i < buf.length; i++) {
        this.data.push(buf[i]);
      }

      cb(null);
    }

    end() {
      this.data = Buffer.from(this.data);
      super.end();
    }
  }

  exports.GetRequiredICOImageSizes = GetRequiredICOImageSizes;

  const GenerateICO = (images, logger = console) => {
    logger.log('ICO:');

    const stream = new WriteStream();
    stream.write(createFileHeader(images.length), 'binary');

    let pngs = [];
    for (let image of images) {
      pngs.push(pngjsNozlib.PNG.sync.read(image));
    }

    let offset = HEADER_SIZE + DIRECTORY_SIZE * images.length;
    pngs.forEach(png => {
      const directory = createDirectory(png, offset);
      stream.write(directory, 'binary');
      offset += png.data.length + BITMAPINFOHEADER_SIZE;
    });
    pngs.forEach(png => {
      const header = createBitmapInfoHeader(png, BI_RGB);
      stream.write(header, 'binary');
      const dib = convertPNGtoDIB(png.data, png.width, png.height, png.bpp);
      stream.write(dib, 'binary');
    });
    stream.end();

    return stream.data;
    //logger.log('  Create: ' + dest);
    //resolve(dest);
  };

  exports.GenerateICO = GenerateICO;
  let _default = GenerateICO;
  exports.default = _default;
}
