const fs = require('fs');
let net = require("net");
const Singleton = require('./Singleton');
var ITPpacket = require("./ITPResponse");

net.bytesWritten = 300000;
net.bufferSize = 300000;

function calculateXOR(hex1, hex2) {
    const xorResult = BigInt(`0x${hex1}`) ^ BigInt(`0x${hex2}`);
    return Number(xorResult);
  }

function matchingBits(hexStr1, hexStr2) {
    // Convert hex strings to binary strings
    let binStr1 = parseInt(hexStr1, 16).toString(2);
    let binStr2 = parseInt(hexStr2, 16).toString(2);
    
    // Pad binary strings with leading zeros if necessary
    while (binStr1.length < binStr2.length) {
      binStr1 = "0" + binStr1;
    }
    while (binStr2.length < binStr1.length) {
      binStr2 = "0" + binStr2;
    }
    
    // Count number of matching bits
    let numMatchingBits = 0;
    for (let i = 0; i < binStr1.length; i++) {
      if (binStr1[i] === binStr2[i]) {
        numMatchingBits++;
      } else {
        break;
      }
    }
    
    return numMatchingBits;
  }

function countOnes(binaryString) {
    let count = 0;
    for (let i = 0; i < binaryString.length; i++) {
      if (binaryString[i] === '1') {
        count++;
      }
    }
    return count;
  }

// Prints the entire packet in bits format
function printPacketBit(packet) {
    var bitString = "";
  
    for (var i = 0; i < packet.length; i++) {
      // To add leading zeros
      var b = "00000000" + packet[i].toString(2);
      // To print 4 bytes per line
      if (i > 0 && i % 4 == 0) bitString += "\n";
      bitString += " " + b.substr(b.length - 8);
    }
    console.log(bitString);
  }

// Store integer value into the packet bit stream
function storeBitPacket(packet, value, offset, length) {
    // let us get the actual byte position of the offset
    let lastBitPosition = offset + length - 1;
    let number = value.toString(2);
    let j = number.length - 1;
    for (var i = 0; i < number.length; i++) {
      let bytePosition = Math.floor(lastBitPosition / 8);
      let bitPosition = 7 - (lastBitPosition % 8);
      if (number.charAt(j--) == "0") {
        packet[bytePosition] &= ~(1 << bitPosition);
      } else {
        packet[bytePosition] |= 1 << bitPosition;
      }
      lastBitPosition--;
    }
  }

// return integer value of a subset bits
function parseBitPacket(packet, offset, length) {
    let number = "";
    for (var i = 0; i < length; i++) {
      // let us get the actual byte position of the offset
      let bytePosition = Math.floor((offset + i) / 8);
      let bitPosition = 7 - ((offset + i) % 8);
      let bit = (packet[bytePosition] >> bitPosition) % 2;
      number = (number << 1) | bit;
    }
    return number;
}

//bit padding function
function padToByte(bits, bitLength) {
    let difference = bitLength - bits.length;
    while(difference > 0) {
        bits = "0".concat(bits);
        difference = difference - 1;
    }
    return bits
}

// Convert a given string to byte array
function stringToBytes(str) {
    var ch,
      st,
      re = [];
    for (var i = 0; i < str.length; i++) {
      ch = str.charCodeAt(i); // get char
      st = []; // set up "stack"
      do {
        st.push(ch & 0xff); // push byte to stack
        ch = ch >> 8; // shift value down by 1 byte
      } while (ch);
      // add stack contents to result
      // done because chars have "wrong" endianness
      re = re.concat(st.reverse());
    }
    // return an array of bytes
    return re;
}

// function encode string
function encodeString(inputString) {
    var decimalString = stringToBytes(inputString);
    var returnString = "";
    for (let x=0;x<decimalString.length;x++) {
      var letter = padToByte(decimalString[x].toString(2),8);
      returnString = returnString.concat(letter);
    }
    return returnString;
  
}

//converts ip given in "127.0.0.1:1234" to byte string
function ipToBytes(ipString) {
    let resultString = "";
    let temp = ipString.slice(0,ipString.indexOf(':'));
    //encode ip portion
    for(let a=0;a<3;a++) {
        let dotpos = temp.indexOf('.');
        resultString+= padToByte(parseInt(temp.substring(0,dotpos)).toString(16),2);
        temp = temp.slice(dotpos+1);
    }
    resultString+= padToByte(parseInt(temp).toString(16),2);
    //encode socket portion
    temp = ipString.slice(ipString.indexOf(':')+1);
    temp = padToByte(parseInt(temp).toString(16),4);
    return resultString+temp;
}

//compiles a input array into final buffer
function bufferizePacket(inputArray) {
    let returnArray = [];
    for(let x=0;x<inputArray.length;x++) {
        returnArray[x] = Buffer.from(inputArray[x]);
    }
    return Buffer.concat(returnArray);
}

function bytesToString(array) {
    var result = "";
    for (var i = 0; i < array.length; ++i) {
      result += String.fromCharCode(array[i]);
    }
    return result;
}

function findNearest(dht, myIp) {
    let myHash = Singleton.getPeerID(myIp);
    index = 0;
    let smallest = calculateXOR(myHash, dht.table[0].node.peerID);
    for(let x=0;x<dht.table.length;x++) {
        if(calculateXOR(myHash, dht.table[0].node.peerID) < smallest) {
            smallest = calculateXOR(myHash, dht.table[0].node.peerID);
            index = x;
        }
    }
    let returnString = dht.table[index].node.peerIP + ":" + dht.table[index].node.peerPort;
    return returnString;
}

function isImagePacket(message) {
    let check = parseBitPacket(message, 4, 20);
    if(check == 0) {
        return true;
    } else {
        return false;
    }
}

function isSearchPacket(message) {
    let check = parseBitPacket(message, 4, 8);
    if(check == 3) {
        return true;
    } else {
        return false;
    }
}

function isFoundPacket(message) {
    let check = parseBitPacket(message, 4, 8);
    if(check == 4) {
        return true;
    } else {
        return false;
    }
}

function itToString(itNum) {
    let imgExt = {
        1: "BMP",
        2: "JPEG",
        3: "GIF",
        4: "PNG",
        5: "TIFF",
        15: "RAW",
    };
    return imgExt[itNum]
}

function stringFromBits(nameInBits) {
    let nameLength = nameInBits.length;
    let returnString = "";
    for(let x=0;x<nameLength/8;x++) {
        let letterAsByte = nameInBits.substring(0+(8*x),8+(8*x));
        returnString = returnString.concat(String.fromCharCode(parseInt(letterAsByte,2))); 
    }
    return returnString;
}

//converts hex to binary string
function hex2bin(hex){
    return (parseInt(hex, 16).toString(2)).padStart(8, '0');
}    

//prints out dictionary of binary strings
function printBinaryString(dictionary) {
    let concatenatedBinaryString = "";
    for (const binaryString of Object.values(dictionary)) {
      concatenatedBinaryString += binaryString;
    }
    for (let i = 0; i < concatenatedBinaryString.length; i += 8) {
      const byte = concatenatedBinaryString.slice(i, i + 8);
      if (i > 0 && i % 32 === 0) {
        console.log();
      }
      process.stdout.write(`${byte} `);
    }
    console.log();
  }

//helper function to print ITP headers
function printFormat(searchMessage) {
    //format search message into printable layout
    let temp = searchMessage;
    temp.originalIP = hex2bin(temp.originalIP);
    temp.originalPort = hex2bin(temp.originalPort);
    temp.originalImagePort = hex2bin(temp.originalImagePort);
    printBinaryString(temp);
}

//converts bytes in ip:socket format back to ip:socket format
function bytesToIP(bytes) {
    let returnString = "";
    //create ip
    for(let x=0;x<4;x++) {
        returnString += parseInt(bytes.substring(0+(2*x),2+(2*x)),16) + '.';
    }
    //create socket
    returnString = returnString.slice(0,-1) + ':';
    returnString += parseInt(bytes.slice(8),16);
    return returnString;
}

//decompiles ImageRequest buffers
function decodeImageRequest(data) {
    let ver = parseBitPacket(data, 0, 4);
    let reqT = parseBitPacket(data, 24, 8);
    let reqN = {
        0: "Query",
        1: "Found",
        2: "Not found",
        3: "Busy",
    };
    let imgExt = {
        1: "BMP",
        2: "JPEG",
        3: "GIF",
        4: "PNG",
        5: "TIFF",
        15: "RAW",
    };
    let ts = parseBitPacket(data, 32, 32);
    let it = parseBitPacket(data, 64, 4);
    let itname = imgExt[it];
    let imgSize = parseBitPacket(data, 68, 28);
    let imgName = bytesToString(data.slice(12, 13 + imgSize));

    let returnDict = {
        version: ver,
        requestType: reqT,
        requestName: reqN[reqT],
        imageExtension: imgExt,
        timeStamp: ts,
        imageType: it,
        imageTypeName: itname,
        imageNameSize: imgSize,
        imageName: imgName,
    };
    return returnDict;
}

//decompiles SearchRequest buffers
function decodeSearchRequest(message) {
    let v = message.subarray(0,4);
    v = String.fromCharCode(...v);

    let messageType = message.subarray(4,12);
    messageType = String.fromCharCode(...messageType);

    let snl = message.subarray(20,32);
    let senderNameLength = String.fromCharCode(...snl)
    senderNameLength = parseInt(senderNameLength,2);

    let position = 32+senderNameLength;

    let senderName = message.subarray(32, position);
    senderName = String.fromCharCode(...senderName);

    let originalIP = message.subarray(position, position+8);
    originalIP = String.fromCharCode(...originalIP);

    position = position+8;

    let originalPort = message.subarray(position, position+4);
    originalPort = String.fromCharCode(...originalPort);

    position = position + 4;

    let originalImagePort = message.subarray(position, position+4);
    originalImagePort = String.fromCharCode(...originalImagePort);

    position = position + 4;

    let IT = message.subarray(position,position+4);
    IT = String.fromCharCode(...IT)

    position = position + 4;

    let ns = message.subarray(position,position+28);
    let nameSize = String.fromCharCode(...ns);
    nameSize = parseInt(nameSize,2);

    position = position + 28;

    let name = message.subarray(position,position + nameSize);
    name = String.fromCharCode(...name);

    let returnDict = {
        v: v,
        messageType: messageType,
        senderNameLength: senderNameLength,
        senderName: senderName,
        originalIP: originalIP, //in byte format
        originalPort: originalPort, //in byte format
        originalImagePort: originalImagePort,
        IT: IT,
        nameSize: nameSize,
        name: name,
    }

    return returnDict;
}

//compile search request buffer message
function compileSearchRequest(dhtTable, imageType, imageName) {
    //image type here is the integer represenation of the extension not a string

    //compile header array
    let headerArray = [];
    //v
    headerArray[0] = "0111";
    //message type
    headerArray[1] = "00000011";
    //reserved
    headerArray[2] = "00000000";
    //sender name length
    headerArray[3] = padToByte(((dhtTable.owner.peerName.length)*8).toString(2),12);
    //sender name
    headerArray[4] = encodeString(dhtTable.owner.peerName);

    //original address
    temp = ipToBytes(dhtTable.owner.peerIP + ":" + dhtTable.owner.peerPort);
    headerArray[5] = temp.slice(0,8);
    headerArray[6] = temp.slice(8);

    //image socket
    headerArray[7] = temp.slice(8);

    //image type 
    headerArray[8] = padToByte(imageType.toString(2),4)
    //file name size in bytes
    headerArray[9] = padToByte(((imageName.length)*8).toString(2),28);
    //file name
    headerArray[10] = encodeString(imageName);
    //compile message buffer
    return bufferizePacket(headerArray);
}

function handleImageRequest(message, dhtTable, sock) {
    let msg = decodeImageRequest(message);
    let imageName = msg.imageName;
    let imageExt = msg.imageTypeName;
    imageName = imageName + "." + imageExt.toLowerCase();

    let ITPsenderName = sock.remoteAddress + ":" + sock.remotePort
    ITPsenderName = bytesToIP(ITPsenderName);

    //print out connection header
    let timestamp = Singleton.getTimestamp();
    console.log("\nClient-" + timestamp + " is connected at timestamp: " + timestamp);

    console.log("\nITP packet received from: " + sock.remoteAddress + ":" + sock.remotePort);
    printPacketBit(message);

    console.log("\nClient-" + timestamp + " requests:");
    console.log("    --ITP version: " + msg.imageType);
    console.log("    --Timestamp: " + msg.timeStamp);
    console.log("    --Request type: " + msg.requestName);
    console.log("    --Image file extension: " + msg.imageTypeName);
    console.log("    --Image file name: " + msg.imageName);

    //check if file exists
    if( fs.existsSync("./" + imageName)) {
        let imageData = fs.readFileSync("./" + imageName); 

        //send back to client
        ITPpacket.init(
            7,
            1,
            Singleton.getSequenceNumber(),
            Singleton.getTimestamp(),
            imageData,
        );
        sock.write(ITPpacket.getBytePacket())
        setTimeout(() => {
            sock.end()
            sock.destroy()
        }, 1000);
    } 
    else {
        //create search packet
        let searchPacket = compileSearchRequest(dhtTable, msg.imageType, msg.imageName)
        let nearestIpPort = findNearest(dhtTable, dhtTable.owner.peerIP + ":" + dhtTable.owner.peerPort); //nearestIpPort is in "127.0.0.1:1234" format
        let targetPort = nearestIpPort.slice(nearestIpPort.indexOf(':')+1);
        let targetAddress = nearestIpPort.slice(0,nearestIpPort.indexOf(':'));

        console.log("\nImage not found locally sending kadPTP request message to " + nearestIpPort);

        //send to nearest
        let nearestSocket = new net.Socket();
        setTimeout(() => {
            nearestSocket.connect({port: parseInt(targetPort), host: targetAddress}, () => {
                nearestSocket.write(searchPacket);
                setTimeout(() => {
                    nearestSocket.end();
                    nearestSocket.destroy();
                },500);
            });
        }, 500)
    }
}

function handleSearchRequest(message, dhtTable) {

    //decode the message
    let searchMessage = decodeSearchRequest(message);
    imageName = stringFromBits(searchMessage.name) + "." + itToString(parseInt(searchMessage.IT,2))

    let ITPsenderName = searchMessage.originalIP + searchMessage.originalPort;
    ITPsenderName = bytesToIP(ITPsenderName);

    let timestamp = Singleton.getTimestamp();
    console.log("\nClient-" + timestamp + " is connected at timestamp: " + timestamp);

    console.log("\nITP packet received from: " + ITPsenderName);
    printFormat(decodeSearchRequest(message));

    console.log("\nClient-" + timestamp + " requests:");
    console.log("    --ITP version: " + parseInt(searchMessage.v,2));
    console.log("    --Timestamp: " + timestamp);
    console.log("    --Request type: Search");
    console.log("    --Image file extension: " + itToString(parseInt(searchMessage.IT,2)));
    console.log("    --Image file name: " + stringFromBits(searchMessage.name));

    //check for image
    if( fs.existsSync("./" + imageName)) {
        //send back to originator
        let imageData = fs.readFileSync("./" + imageName); 
        ITPpacket.init(
            7,
            4,
            Singleton.getSequenceNumber(),
            Singleton.getTimestamp(),
            imageData,
        );
        //get originators ip
        let originAddress = searchMessage.originalIP;
        let originPort = searchMessage.originalPort;
        originAddress = bytesToIP(originAddress+originPort);
        originPort = originAddress.slice(originAddress.indexOf(':')+1);
        originAddress = originAddress.slice(0,originAddress.indexOf(':'));

        //send found packet back to original peer
        let sock = new net.Socket();
        setTimeout(() => {
            sock.connect({port: parseInt(originPort), host: originAddress}, () => {
            sock.write(ITPpacket.getBytePacket());
            setTimeout(() => {
                sock.end()
                sock.destroy()
            }, 500);
            });
        });
    } else {
        //forward packet to nearest
        let nearestIpPort = findNearest(dhtTable, dhtTable.owner.peerIP + ":" + dhtTable.owner.peerPort); //nearestIpPort is in "127.0.0.1:1234" format
        let targetPort = nearestIpPort.slice(nearestIpPort.indexOf(':')+1);
        let targetAddress = nearestIpPort.slice(0,nearestIpPort.indexOf(':'));

        console.log("\nImage not found locally sending kadPTP request message to " + nearestIpPort);

        //send to nearest
        let nearestSocket = new net.Socket();
        setTimeout(() => {
            nearestSocket.connect({port: parseInt(targetPort), host: targetAddress}, () => {
                nearestSocket.write(message);
                setTimeout(() => {
                    nearestSocket.end();
                    nearestSocket.destroy();
                },500);
            });
        }, 500)
    }
}

function handleFoundPacket(message, sock) {
    console.log("\nITP packet response received forwarding image to client");
    if (message[1] == 64) {
        //change type from 4 to 1 
        message[1] = 16;
        sock.write(message);
        setTimeout(() => {
            sock.end();
            sock.destroy();
        }, 1000);
    }
}

module.exports = {
    isImagePacket,
    isSearchPacket,
    isFoundPacket,
    handleImageRequest,
    handleSearchRequest,
    handleFoundPacket,
}
