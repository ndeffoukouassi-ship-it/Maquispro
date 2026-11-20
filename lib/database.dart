import 'package:sqflite/sqflite.dart';
import 'models.dart';

/// Base de démonstration LOCALE. Non synchronisée avec Firebase.
class MaquisDatabase {
  MaquisDatabase._();
  static final MaquisDatabase instance = MaquisDatabase._();
  late Database _db;

  Future<void> open() async {
    final base = await getDatabasesPath();
    _db = await openDatabase('$base/maquispro_test_v1.db', version: 1,
      onCreate: (db, version) async {
        await db.execute('''CREATE TABLE boissons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL, code_barres TEXT UNIQUE,
          prix_achat INTEGER NOT NULL CHECK(prix_achat >= 0),
          prix_vente INTEGER NOT NULL CHECK(prix_vente > 0),
          stock INTEGER NOT NULL CHECK(stock >= 0))''');
        await db.execute('''CREATE TABLE ventes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          id_boisson INTEGER NOT NULL, boisson TEXT NOT NULL,
          serveur TEXT NOT NULL, prix_achat INTEGER NOT NULL,
          prix_vente INTEGER NOT NULL, date_ms INTEGER NOT NULL)''');
        await db.execute('''CREATE TABLE depenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          libelle TEXT NOT NULL, montant INTEGER NOT NULL CHECK(montant >= 0),
          date_ms INTEGER NOT NULL)''');
        await db.insert('boissons', {
          'nom':'Castel 65 cl','code_barres':null,
          'prix_achat':550,'prix_vente':650,'stock':24,
        });
      },
    );
  }

  Future<MaquisSnapshot> snapshot() async {
    final drinks = (await _db.query('boissons',orderBy:'nom ASC'))
      .map(Drink.fromMap).toList();
    final sales = (await _db.query('ventes',orderBy:'date_ms DESC, id DESC'))
      .map(Sale.fromMap).toList();
    final expenses = (await _db.query('depenses',orderBy:'date_ms DESC'))
      .map(Expense.fromMap).toList();
    return MaquisSnapshot(drinks:drinks,sales:sales,expenses:expenses);
  }

  Future<void> addDrink({required String name, required int purchasePrice,
    required int salePrice,required int stock,String? barcode}) async {
    if(name.trim().isEmpty || purchasePrice<0 || salePrice<=0 || stock<0){
      throw ArgumentError('Nom, prix ou stock invalide.');
    }
    final trimmed=barcode?.trim() ?? '';
    await _db.insert('boissons', {
      'nom':name.trim(), 'code_barres':trimmed.isEmpty?null:trimmed,
      'prix_achat':purchasePrice,'prix_vente':salePrice,'stock':stock,
    });
  }

  Future<void> restock({required int id, required int quantity,
    required int purchasePrice}) async {
    if(quantity<=0 || purchasePrice<0) throw ArgumentError('Approvisionnement invalide.');
    await _db.transaction((txn) async {
      final rows=await txn.rawUpdate(
        'UPDATE boissons SET stock = stock + ?, prix_achat = ? WHERE id = ?',
        [quantity,purchasePrice,id],
      );
      if(rows!=1) throw StateError('Boisson introuvable.');
    });
  }

  Future<void> addExpense(String label, int amount) async {
    if(label.trim().isEmpty || amount<0) throw ArgumentError('Dépense invalide.');
    await _db.insert('depenses', {
      'libelle':label.trim(), 'montant':amount,
      'date_ms':DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<Sale> sellByBarcode(String code, String server) async {
    final matches=await _db.query('boissons',
      where:'code_barres = ?', whereArgs:[code.trim()],limit:1);
    if(matches.isEmpty) throw StateError('Code-barres inconnu : aucune vente enregistrée.');
    return sellById(matches.first['id'] as int,server);
  }

  Future<Sale> sellById(int id,String server) async {
    if(server.trim().isEmpty) throw ArgumentError('Serveur obligatoire.');
    return _db.transaction<Sale>((txn) async {
      final rows=await txn.query('boissons',where:'id = ?',whereArgs:[id],limit:1);
      if(rows.isEmpty) throw StateError('Boisson inconnue.');
      final drink=Drink.fromMap(rows.first);
      if(drink.stock<1) throw StateError('Rupture de stock : vente refusée.');
      final updated=await txn.rawUpdate(
        'UPDATE boissons SET stock = stock - 1 WHERE id = ? AND stock > 0',[id],
      );
      if(updated!=1) throw StateError('Stock insuffisant.');
      final now=DateTime.now().millisecondsSinceEpoch;
      final saleId=await txn.insert('ventes', {
        'id_boisson':id,'boisson':drink.name,'serveur':server.trim(),
        'prix_achat':drink.purchasePrice,'prix_vente':drink.salePrice,
        'date_ms':now,
      });
      return Sale(id:saleId,drinkName:drink.name,server:server,
        price:drink.salePrice,cost:drink.purchasePrice,
        timestamp:DateTime.fromMillisecondsSinceEpoch(now));
    });
  }
}
