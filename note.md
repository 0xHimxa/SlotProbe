

// this how which slot to put in is been calculated

$$\text{Slot} = \text{keccak256}(\text{ArraySlot}) + \left( \frac{i \times \text{sizeOf(Type)}}{256} \right)$$







need to check how data is been passed to mapping for slot calculation



0xa9ec9f8A35148e4258F2B06520BBc71c1b38bB48








keep mapping that return struct that contain array tho simil opperation like above is been performd if it 32 byts no packed else it will  be packed together


 caclulating bytes char, extracting

startChar = $$\text{startChar} = (32 - \text{offset} - \text{size}) \times 2$$
 endChar = $$\text{endChar} =  startChar( number of bytes * 2 )


 check weather nested value is been handle for uint or other value than address

this following function Uitility is not been used it using the json provided since is has similar stufff
structMemberSlot, structMemberByteOffset
