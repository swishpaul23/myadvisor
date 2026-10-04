from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization as s

k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
open("rsa_key.p8", "wb").write(
   k.private_bytes(s.Encoding.PEM, s.PrivateFormat.PKCS8, s.NoEncryption())
)
open("rsa_key.pub", "wb").write(
   k.public_key().public_bytes(s.Encoding.PEM, s.PublicFormat.SubjectPublicKeyInfo)
)