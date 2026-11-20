import 'package:flutter_test/flutter_test.dart';
import 'package:maquispro/models.dart';

void main() {
  test('Marge brute Castel = 100 FCFA', () {
    const drink = Drink(id: 1,name:'Castel 65 cl',purchasePrice:550,salePrice:650,stock:24);
    expect(drink.grossProfitPerUnit,100);
  });

  test('Recettes et bénéfice après charges', () {
    final s = MaquisSnapshot(drinks:[],
      sales:[Sale(id:1,drinkName:'Castel',server:'Kouamé',price:650,cost:550,timestamp:DateTime(2026))],
      expenses:[const Expense(label:'Transport',amount:40)]);
    expect(s.revenue,650);
    expect(s.grossProfit,100);
    expect(s.netProfit,60);
  });
}
